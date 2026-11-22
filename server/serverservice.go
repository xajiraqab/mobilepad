package main

import (
	"fmt"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type ServerStatus struct {
	Running    bool         `json:"running"`
	Address    string       `json:"address"`
	Host       string       `json:"host"`
	Port       int          `json:"port"`
	Clients    int          `json:"clients"`
	UptimeSec  int64        `json:"uptimeSec"`
	LastError  string       `json:"lastError"`
	ClientList []ClientInfo `json:"clientList"`
}

type ServerService struct {
	app      *application.App
	window   *application.WebviewWindow
	settings Settings
	ws       *WSServer
}

func NewServerService() *ServerService {
	s := &ServerService{
		settings: loadSettings(),
	}
	s.ws = NewWSServer(s.settings, s.emitStatus)
	return s
}

func (s *ServerService) SetApp(app *application.App) {
	s.app = app
}

func (s *ServerService) SetWindow(window *application.WebviewWindow) {
	s.window = window
}

func (s *ServerService) HideToTray() {
	if s.window != nil {
		s.window.Hide()
	}
}

func (s *ServerService) emitStatus() {
	if s.app == nil {
		return
	}
	s.app.Event.Emit("server:status", s.ws.Status())
}

func (s *ServerService) StartServer() (ServerStatus, error) {
	s.ws.UpdateSettings(s.settings)
	if err := s.ws.Start(); err != nil {
		return s.ws.Status(), err
	}
	return s.ws.Status(), nil
}

func (s *ServerService) StopServer() (ServerStatus, error) {
	if err := s.ws.Stop(); err != nil {
		return s.ws.Status(), err
	}
	return s.ws.Status(), nil
}

func (s *ServerService) GetStatus() ServerStatus {
	return s.ws.Status()
}

func (s *ServerService) GetSettings() Settings {
	return s.settings
}

func (s *ServerService) UpdateSettings(next Settings) (Settings, error) {
	if next.Port <= 0 || next.Port > 65535 {
		return s.settings, fmt.Errorf("port must be between 1 and 65535")
	}
	if next.Host == "" {
		next.Host = "0.0.0.0"
	}

	wasRunning := s.ws.Status().Running
	if wasRunning {
		if err := s.ws.Stop(); err != nil {
			return s.settings, err
		}
	}

	s.settings = next
	s.ws.UpdateSettings(next)
	if err := saveSettings(next); err != nil {
		if wasRunning {
			_ = s.ws.Start()
		}
		return s.settings, err
	}

	if wasRunning {
		if err := s.ws.Start(); err != nil {
			return s.settings, err
		}
	}
	s.emitStatus()
	return s.settings, nil
}

func (s *ServerService) DisconnectClient(id string) (ServerStatus, error) {
	if err := s.ws.DisconnectClient(id); err != nil {
		return s.ws.Status(), err
	}
	return s.ws.Status(), nil
}
