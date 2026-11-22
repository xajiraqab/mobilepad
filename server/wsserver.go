package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type wsMessage struct {
	Type      string   `json:"type"`
	DX        float64  `json:"dx"`
	DY        float64  `json:"dy"`
	Button    string   `json:"button"`
	Key       string   `json:"key"`
	Text      string   `json:"text"`
	Modifiers []string `json:"modifiers"`
	Platform  string   `json:"platform"`
	OsName    string   `json:"osName"`
	Brand     string   `json:"brand"`
	Model     string   `json:"model"`
	Name      string   `json:"name"`
}

type ClientInfo struct {
	ID       string `json:"id"`
	Addr     string `json:"addr"`
	Platform string `json:"platform"`
	OsName   string `json:"osName"`
	Brand    string `json:"brand"`
	Model    string `json:"model"`
	Name     string `json:"name"`
}

type clientConn struct {
	conn *websocket.Conn
	info ClientInfo
}

type WSServer struct {
	mu        sync.Mutex
	settings  Settings
	server    *http.Server
	listener  net.Listener
	clients   map[string]*clientConn
	nextID    int
	running   bool
	boundPort int
	startedAt time.Time
	lastErr   string
	onChange  func()
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // local-network touchpad client; auth can be added later
	},
}

func NewWSServer(s Settings, onChange func()) *WSServer {
	return &WSServer{
		settings: s,
		clients:  make(map[string]*clientConn),
		onChange: onChange,
	}
}

func (s *WSServer) Start() error {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return nil
	}
	host := s.settings.Host
	startPort := s.settings.Port
	var ln net.Listener
	var err error
	boundPort := startPort
	for i := 0; i < 100; i++ {
		p := startPort + i
		if p > 65535 {
			break
		}
		addr := fmt.Sprintf("%s:%d", host, p)
		ln, err = net.Listen("tcp", addr)
		if err == nil {
			boundPort = p
			break
		}
	}
	if ln == nil {
		if err != nil {
			s.lastErr = err.Error()
		} else {
			s.lastErr = "no available port found"
		}
		s.mu.Unlock()
		s.notify()
		return fmt.Errorf("%s", s.lastErr)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", s.handleWS)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		host, _ := os.Hostname()
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "service": "mobilepad", "name": host})
	})

	srv := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	s.server = srv
	s.listener = ln
	s.running = true
	s.boundPort = boundPort
	s.startedAt = time.Now()
	s.lastErr = ""
	s.mu.Unlock()
	s.notify()

	go func() {
		err := srv.Serve(ln)
		s.mu.Lock()
		wasRunning := s.running
		s.running = false
		s.server = nil
		s.listener = nil
		for id, c := range s.clients {
			_ = c.conn.Close()
			delete(s.clients, id)
		}
		if err != nil && err != http.ErrServerClosed && wasRunning {
			s.lastErr = err.Error()
		}
		s.mu.Unlock()
		s.notify()
	}()
	return nil
}

func (s *WSServer) Stop() error {
	s.mu.Lock()
	if !s.running || s.server == nil {
		s.running = false
		s.mu.Unlock()
		s.notify()
		return nil
	}
	srv := s.server
	s.running = false
	s.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	err := srv.Shutdown(ctx)
	if err != nil {
		_ = srv.Close()
	}
	s.notify()
	return nil
}

func (s *WSServer) UpdateSettings(next Settings) {
	s.mu.Lock()
	s.settings = next
	s.mu.Unlock()
}

func (s *WSServer) Status() ServerStatus {
	s.mu.Lock()
	defer s.mu.Unlock()
	port := s.settings.Port
	if s.running && s.boundPort != 0 {
		port = s.boundPort
	}
	addr := fmt.Sprintf("%s:%d", s.settings.Host, port)
	clientList := make([]ClientInfo, 0, len(s.clients))
	for _, c := range s.clients {
		clientList = append(clientList, c.info)
	}
	status := ServerStatus{
		Running:    s.running,
		Address:    addr,
		Clients:    len(s.clients),
		Port:       port,
		Host:       s.settings.Host,
		LastError:  s.lastErr,
		ClientList: clientList,
	}
	if s.running {
		status.UptimeSec = int64(time.Since(s.startedAt).Seconds())
	}
	return status
}

func (s *WSServer) notify() {
	if s.onChange != nil {
		s.onChange()
	}
}

func (s *WSServer) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	s.mu.Lock()
	s.nextID++
	id := fmt.Sprintf("%d", s.nextID)
	s.clients[id] = &clientConn{conn: conn, info: ClientInfo{ID: id, Addr: conn.RemoteAddr().String()}}
	s.mu.Unlock()
	s.notify()

	defer func() {
		s.mu.Lock()
		if _, ok := s.clients[id]; ok {
			delete(s.clients, id)
			_ = conn.Close()
		}
		s.mu.Unlock()
		s.notify()
	}()

	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			return
		}
		var msg wsMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}
		s.handleMessage(id, msg)
	}
}

func resolveModelName(platform, osName, _ string) string {
	p := platform + " " + osName
	switch {
	case containsFold(p, "android"):
		return "Android"
	case containsFold(p, "ios"), containsFold(p, "iphone"), containsFold(p, "ipad"):
		return "iPhone"
	default:
		if osName != "" {
			return osName
		}
		if platform != "" {
			return platform
		}
		return "Unknown device"
	}
}

func containsFold(s, sub string) bool {
	return len(s) >= len(sub) && (func() bool {
		// simple case-insensitive contains
		sl := make([]byte, len(s))
		for i := 0; i < len(s); i++ {
			c := s[i]
			if c >= 'A' && c <= 'Z' {
				c += 'a' - 'A'
			}
			sl[i] = c
		}
		subl := make([]byte, len(sub))
		for i := 0; i < len(sub); i++ {
			c := sub[i]
			if c >= 'A' && c <= 'Z' {
				c += 'a' - 'A'
			}
			subl[i] = c
		}
		return strings.Contains(string(sl), string(subl))
	})()
}

func (s *WSServer) handleMessage(id string, msg wsMessage) {
	switch msg.Type {
	case "move":
		moveCursor(int32(msg.DX), int32(msg.DY))
	case "click":
		click(msg.Button)
	case "down":
		if msg.Key != "" {
			keyDown(msg.Key)
		} else {
			mouseDown(msg.Button)
		}
	case "up":
		if msg.Key != "" {
			keyRelease(msg.Key)
		} else {
			mouseUp(msg.Button)
		}
	case "scroll":
		// Client sends delta; scale for wheel (Windows wheel delta is typically 120 units)
		scroll(int32(msg.DX), int32(msg.DY))
	case "key":
		if len(msg.Modifiers) > 0 {
			sendShortcut(msg.Modifiers, msg.Key)
		} else {
			tapKey(msg.Key)
		}
	case "shortcut":
		sendShortcut(msg.Modifiers, msg.Key)
	case "text":
		if msg.Text != "" {
			typeText(msg.Text)
		}
	case "hello":
		s.mu.Lock()
		if c, ok := s.clients[id]; ok {
			c.info.Platform = msg.Platform
			c.info.OsName = msg.OsName
			c.info.Brand = msg.Brand
			c.info.Model = resolveModelName(msg.Platform, msg.OsName, msg.Model)
			c.info.Name = msg.Name
		}
		s.mu.Unlock()
		s.notify()
	case "ping":
		// no-op; client may use for keepalive
	default:
		// ignore unknown messages
	}
}

func (s *WSServer) DisconnectClient(id string) error {
	s.mu.Lock()
	c, ok := s.clients[id]
	if !ok {
		s.mu.Unlock()
		return nil
	}
	delete(s.clients, id)
	s.mu.Unlock()
	_ = c.conn.Close()
	s.notify()
	return nil
}
