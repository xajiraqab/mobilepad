import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Network from 'expo-network';
import {
  ActivityIndicator,
  Animated,
  Image,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useKeepAwake } from 'expo-keep-awake';

const SERVER_PORT = 8765;
const SETTINGS_KEY = 'mobilepad_settings_v1';
const PORT_SCAN_COUNT = 20;
const DISCOVERY_TIMEOUT_MS = 700;
const DISCOVERY_BATCH = 32;
const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 8;
const SCROLL_STRIP_WIDTH = 56;

const THEMES = {
  dark: {
    bg: '#0f141b',
    bg2: '#0b1017',
    card: '#18212d',
    cardBorder: '#273445',
    text: '#f3f7fb',
    muted: '#97a8bc',
    subtle: 'rgba(255,255,255,0.20)',
    accent: '#66aaff',
    accentBtn: '#4ea1ff',
    accentBtnText: '#08111d',
    stripBg: '#111924',
    stripBorder: 'rgba(78,161,255,0.18)',
    stripText: 'rgba(102,170,255,0.55)',
    btnBg: 'rgba(24,33,45,0.72)',
    btnBorder: 'rgba(78,161,255,0.22)',
    btnText: 'rgba(231,238,247,0.82)',
    settingsBg: 'rgba(24,33,45,0.65)',
    modalBg: 'rgba(0,0,0,0.56)',
    inputBg: '#0f141b',
    inputBorder: '#314055',
    presetBg: '#0f141b',
    presetBorder: '#314055',
  },
  light: {
    bg: '#fff8e1',
    bg2: '#ffefbf',
    card: '#fffdf5',
    cardBorder: '#e6d39a',
    text: '#3b2f10',
    muted: '#7a6731',
    subtle: 'rgba(59,47,16,0.22)',
    accent: '#c58a00',
    accentBtn: '#d89a00',
    accentBtnText: '#fffaf0',
    stripBg: '#f7e3a6',
    stripBorder: 'rgba(197,138,0,0.28)',
    stripText: 'rgba(138,93,0,0.65)',
    btnBg: 'rgba(255,252,242,0.88)',
    btnBorder: 'rgba(197,138,0,0.28)',
    btnText: '#3b2f10',
    settingsBg: 'rgba(255,252,242,0.85)',
    modalBg: 'rgba(59,47,16,0.28)',
    inputBg: '#fff8e1',
    inputBorder: '#dccb91',
    presetBg: '#fff8e1',
    presetBorder: '#dccb91',
  },
};

function clampInt(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function probeHost(ip, port) {
  try {
    const res = await fetchWithTimeout(`http://${ip}:${port}/health`, DISCOVERY_TIMEOUT_MS);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.ok === true && data.service === 'mobilepad') {
      return { ip, port, name: data.name || ip };
    }
  } catch {}
  return null;
}

async function discoverServer() {
  let subnetPrefix = null;
  try {
    const ip = await Network.getIpAddressAsync();
    if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
      subnetPrefix = ip.split('.').slice(0, 3).join('.');
    }
  } catch {}
  if (!subnetPrefix) return null;

  const ips = [];
  for (let i = 1; i <= 254; i++) ips.push(`${subnetPrefix}.${i}`);

  for (let portOffset = 0; portOffset < PORT_SCAN_COUNT; portOffset++) {
    const port = SERVER_PORT + portOffset;
    for (let i = 0; i < ips.length; i += DISCOVERY_BATCH) {
      const batch = ips.slice(i, i + DISCOVERY_BATCH);
      const results = await Promise.all(batch.map((ip) => probeHost(ip, port)));
      const found = results.find(Boolean);
      if (found) return found;
    }
  }
  return null;
}

const sensitivityStyles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '700', letterSpacing: 0.2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { minWidth: 44, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, alignItems: 'center' },
  badgeText: { fontSize: 13, fontWeight: '800' },
  resetBtn: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  trackWrap: { height: 44, justifyContent: 'center', marginBottom: 18 },
  track: { height: 6, borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  thumb: { position: 'absolute', width: 24, height: 24, borderRadius: 12, marginLeft: -12, top: 10, borderWidth: 2 },
});

const SensitivitySlider = React.memo(function SensitivitySlider({ value, onCommit, c }) {
  const clamp = (v) => Math.min(8, Math.max(1, Math.round(v)));
  const ratio = (v) => (clamp(v) - 1) / 7;
  const [display, setDisplay] = useState(clamp(value));
  const widthRef = useRef(200);
  const trackXRef = useRef(0);
  const trackRef = useRef(null);
  const dragVal = useRef(clamp(value));
  const pos = useRef(new Animated.Value(ratio(value))).current;

  useEffect(() => {
    const v = clamp(value);
    dragVal.current = v;
    setDisplay(v);
    pos.setValue(ratio(v));
  }, [value, pos]);

  const measureTrack = useCallback(() => {
    const node = trackRef.current;
    if (node && typeof node.measureInWindow === 'function') {
      node.measureInWindow((x, _y, w) => {
        if (typeof x === 'number') trackXRef.current = x;
        if (typeof w === 'number' && w > 0) widthRef.current = w;
      });
    }
  }, []);

  const updateFromEvent = useCallback((e) => {
    const pageX = e.nativeEvent.pageX;
    const x = typeof pageX === 'number' ? pageX - trackXRef.current : e.nativeEvent.locationX;
    const w = widthRef.current || 200;
    const r = Math.min(1, Math.max(0, x / w));
    const v = clamp(1 + r * 7);
    dragVal.current = v;
    pos.setValue((v - 1) / 7);
    setDisplay(v);
  }, [pos]);

  const commit = useCallback(() => {
    onCommit(dragVal.current);
  }, [onCommit]);

  const left = pos.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <>
      <View style={sensitivityStyles.header}>
        <Text style={[sensitivityStyles.label, { color: c.muted }]}>Sensitivity</Text>
        <View style={sensitivityStyles.headerRight}>
          <View style={[sensitivityStyles.badge, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
            <Text style={[sensitivityStyles.badgeText, { color: c.text }]}>{display}x</Text>
          </View>
          <Pressable style={[sensitivityStyles.resetBtn, { backgroundColor: c.presetBg, borderColor: c.inputBorder }]} onPress={() => onCommit(3)}>
            <Ionicons name="refresh-outline" size={18} color={c.text} />
          </Pressable>
        </View>
      </View>
      <View
        ref={trackRef}
        style={sensitivityStyles.trackWrap}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
          measureTrack();
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => { measureTrack(); updateFromEvent(e); }}
        onResponderMove={updateFromEvent}
        onResponderRelease={commit}
        onResponderTerminate={commit}
      >
        <View style={[sensitivityStyles.track, { backgroundColor: c.inputBg }]}>
          <Animated.View style={[sensitivityStyles.fill, { backgroundColor: c.accent, width: left }]} />
        </View>
        <Animated.View
          style={[
            sensitivityStyles.thumb,
            { left, backgroundColor: c.card, borderColor: c.accent },
          ]}
        />
      </View>
    </>
  );
});

export default function App() {
  useKeepAwake();
  const [phase, setPhase] = useState('searching'); // searching | not_found | connecting | connected
  const [server, setServer] = useState(null);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const modalAnim = useRef(new Animated.Value(0)).current;
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [shortcutsModalVisible, setShortcutsModalVisible] = useState(false);
  const shortcutsAnim = useRef(new Animated.Value(0)).current;
  const [sensitivity, setSensitivity] = useState(3);
  const [showSpace, setShowSpace] = useState(true);
  const [showScrollStrip, setShowScrollStrip] = useState(true);
  const [scrollReverse, setScrollReverse] = useState(true);
  const [theme, setTheme] = useState('dark');
  const settingsLoadedRef = useRef(false);
  const [keyboardValue, setKeyboardValue] = useState(' ');

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (typeof saved.sensitivity === 'number') setSensitivity(Math.min(8, Math.max(1, Math.round(saved.sensitivity))));
          if (typeof saved.showSpace === 'boolean') setShowSpace(saved.showSpace);
          if (typeof saved.showScrollStrip === 'boolean') setShowScrollStrip(saved.showScrollStrip);
          if (typeof saved.scrollReverse === 'boolean') setScrollReverse(saved.scrollReverse);
          if (saved.theme === 'light' || saved.theme === 'dark') setTheme(saved.theme);
        }
      } catch {}
      settingsLoadedRef.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!settingsLoadedRef.current) return;
    const data = { sensitivity, showSpace, showScrollStrip, scrollReverse, theme };
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(data)).catch(() => {});
  }, [sensitivity, showSpace, showScrollStrip, scrollReverse, theme]);
  const [tapMark, setTapMark] = useState(null);
  const tapMarkOpacity = useRef(new Animated.Value(0)).current;
  const tapMarkScale = useRef(new Animated.Value(0.6)).current;
  const [shortcuts] = useState([
    { label: 'Esc', type: 'key', key: 'escape' },
    { label: 'Up', type: 'key', key: 'up', icon: 'arrow-up' },
    { label: 'Enter', type: 'key', key: 'enter' },
    { label: 'Left', type: 'key', key: 'left', icon: 'arrow-back' },
    { label: 'Down', type: 'key', key: 'down', icon: 'arrow-down' },
    { label: 'Right', type: 'key', key: 'right', icon: 'arrow-forward' },
    { label: 'MB1', type: 'click', button: 'left' },
    { label: 'MB3', type: 'click', button: 'middle' },
    { label: 'MB2', type: 'click', button: 'right' },
    { label: 'Ctrl + T', modifiers: ['ctrl'], key: 't' },
    { label: 'Ctrl + W', modifiers: ['ctrl'], key: 'w' },
    { label: 'Ctrl + R', modifiers: ['ctrl'], key: 'r' },
    { label: 'Ctrl + C', modifiers: ['ctrl'], key: 'c' },
    { label: 'Ctrl + V', modifiers: ['ctrl'], key: 'v' },
    { label: 'Ctrl + X', modifiers: ['ctrl'], key: 'x' },
    { label: 'Ctrl + A', modifiers: ['ctrl'], key: 'a' },
    { label: 'Ctrl + Z', modifiers: ['ctrl'], key: 'z' },
    { label: 'Ctrl + Y', modifiers: ['ctrl'], key: 'y' },
  ]);
  const c = THEMES[theme];
  const { width: winW, height: winH } = useWindowDimensions();
  const dots = useMemo(() => {
    const arr = [];
    const step = 32;
    const w = winW - (showScrollStrip ? SCROLL_STRIP_WIDTH : 0);
    for (let y = 16; y < winH - 60; y += step) {
      for (let x = 16; x < w - 8; x += step) {
        arr.push({ x, y });
      }
    }
    return arr;
  }, [winW, winH, showScrollStrip]);

  const openSettings = useCallback(() => {
    setSettingsOpen(true);
    setModalVisible(true);
    modalAnim.setValue(0);
    Animated.timing(modalAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [modalAnim]);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    Animated.timing(modalAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setModalVisible(false);
    });
  }, [modalAnim]);

  const openShortcuts = useCallback(() => {
    setShortcutsOpen(true);
    setShortcutsModalVisible(true);
    shortcutsAnim.setValue(0);
    Animated.timing(shortcutsAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [shortcutsAnim]);

  const closeShortcuts = useCallback(() => {
    setShortcutsOpen(false);
    Animated.timing(shortcutsAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setShortcutsModalVisible(false);
    });
  }, [shortcutsAnim]);

  const wsRef = useRef(null);
  const mountedRef = useRef(true);
  const sensitivityRef = useRef(2);

  // touchpad refs
  const startTouchRef = useRef(null);
  const startLocRef = useRef(null);
  const touchpadRef = useRef(null);
  const touchpadOriginRef = useRef({ x: 0, y: 0 });
  const lastTouchRef = useRef(null);
  const movedRef = useRef(false);
  const longPressFiredRef = useRef(false);
  const longPressTimerRef = useRef(null);
  const lastTapTimeRef = useRef(0);
  const dragSelectModeRef = useRef(false);
  const pendingDragSelectRef = useRef(false);
  const twoFingerRef = useRef(false);
  const lastTwoFingerYRef = useRef(null);
  const threeFingerRef = useRef(false);
  const scrollReverseRef = useRef(true);
  const keyboardRef = useRef(null);
  const keyboardBuffer = useRef(' ');

  // scroll strip refs
  const lastScrollYRef = useRef(null);

  useEffect(() => { sensitivityRef.current = sensitivity; }, [sensitivity]);
  useEffect(() => { scrollReverseRef.current = scrollReverse; }, [scrollReverse]);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const cleanupSocket = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      try { ws.onopen = null; ws.onclose = null; ws.onerror = null; ws.onmessage = null; ws.close(); } catch {}
    }
  }, []);

  const send = useCallback((payload) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return false;
    try { ws.send(JSON.stringify(payload)); return true; } catch { return false; }
  }, []);

  const showTapMark = useCallback((x, y) => {
    setTapMark({ x, y });
    tapMarkOpacity.setValue(0.7);
    tapMarkScale.setValue(0.5);
    Animated.parallel([
      Animated.timing(tapMarkOpacity, { toValue: 0, duration: 520, useNativeDriver: true }),
      Animated.timing(tapMarkScale, { toValue: 2.8, duration: 520, useNativeDriver: true }),
    ]).start();
  }, [tapMarkOpacity, tapMarkScale]);

  const updateTouchpadOrigin = useCallback(() => {
    const node = touchpadRef.current;
    if (node && typeof node.measureInWindow === 'function') {
      node.measureInWindow((x, y) => {
        if (typeof x === 'number' && typeof y === 'number') touchpadOriginRef.current = { x, y };
      });
    }
  }, []);

  const openKeyboard = useCallback(() => {
    keyboardBuffer.current = ' ';
    setKeyboardValue(' ');
    keyboardRef.current?.blur();
    setTimeout(() => keyboardRef.current?.focus(), 80);
  }, []);

  const onKeyboardChange = useCallback((text) => {
    const prev = keyboardBuffer.current;
    if (text.length > prev.length) {
      const added = text.slice(prev.length);
      if (added) send({ type: 'text', text: added });
    } else if (text.length < prev.length) {
      const diff = prev.length - text.length;
      for (let i = 0; i < diff; i++) send({ type: 'key', key: 'backspace' });
    }
    // keep sentinel prefix
    if (!text.startsWith(' ')) {
      keyboardBuffer.current = ' ' + text;
      setKeyboardValue(' ' + text);
    } else {
      keyboardBuffer.current = text;
      setKeyboardValue(text);
    }
  }, [send]);

  const onKeyboardSubmit = useCallback(() => {
    send({ type: 'key', key: 'enter' });
  }, [send]);

  const connectToServer = useCallback((found) => {
    cleanupSocket();
    setServer(found);
    setError('');
    setPhase('connecting');
    const url = `ws://${found.ip}:${found.port}/ws`;
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => {
        if (wsRef.current !== ws || !mountedRef.current) return;
        try {
          ws.send(JSON.stringify({
            type: 'hello',
            platform: Platform.OS,
            osName: Device.osName || Platform.OS,
            brand: Device.brand || '',
            model: Device.modelName || '',
            name: Device.deviceName || '',
          }));
        } catch {}
        setPhase('connected');
        setError('');
      };
      ws.onclose = () => {
        if (wsRef.current !== ws || !mountedRef.current) return;
        wsRef.current = null;
        setPhase('not_found');
        setError('Connection to server lost.');
      };
      ws.onerror = () => {
        if (wsRef.current !== ws || !mountedRef.current) return;
        setError('Could not connect to server.');
      };
    } catch (e) {
      setPhase('not_found');
      setError(String(e?.message || e));
    }
  }, [cleanupSocket]);

  const startDiscovery = useCallback(async () => {
    cleanupSocket();
    setError('');
    setServer(null);
    setPhase('searching');
    const found = await discoverServer();
    if (!mountedRef.current) return;
    if (found) {
      connectToServer(found);
    } else {
      setPhase('not_found');
      setError('Server not found. Make sure Mobile Pad server is running on your PC and both devices are on the same Wi-Fi network.');
    }
  }, [cleanupSocket, connectToServer]);

  useEffect(() => {
    startDiscovery();
    return () => {
      cleanupSocket();
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, [cleanupSocket, startDiscovery]);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const touchpadResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: (evt) => {
      if (phase !== 'connected' || settingsOpen) return false;
      const t = evt.nativeEvent.touches?.[0];
      if (!t) return false;
      if (t.pageX < 100 && t.pageY < 110) return false;
      return true;
    },
    onMoveShouldSetPanResponder: (evt) => {
      if (phase !== 'connected' || settingsOpen) return false;
      const t = evt.nativeEvent.touches?.[0];
      if (!t) return false;
      if (t.pageX < 100 && t.pageY < 110) return false;
      return true;
    },
    onPanResponderGrant: (evt) => {
      Keyboard.dismiss();
      const touches = evt.nativeEvent.touches || [];
      const t = touches[0];
      if (!t) return;
      startTouchRef.current = { x: t.pageX, y: t.pageY };
      lastTouchRef.current = { x: t.pageX, y: t.pageY };
      startLocRef.current = {
        x: (t.pageX ?? t.locationX ?? 0) - (t.pageX != null ? touchpadOriginRef.current.x : 0),
        y: (t.pageY ?? t.locationY ?? 0) - (t.pageY != null ? touchpadOriginRef.current.y : 0),
      };
      movedRef.current = false;
      longPressFiredRef.current = false;
      dragSelectModeRef.current = false;
      pendingDragSelectRef.current = false;
      twoFingerRef.current = false;
      lastTwoFingerYRef.current = null;
      threeFingerRef.current = touches.length >= 3;
      clearLongPressTimer();

      if (threeFingerRef.current) return;

      const now = Date.now();
      if (now - lastTapTimeRef.current < 250) {
        // double-tap-hold candidate: wait for movement before sending mouse down
        pendingDragSelectRef.current = true;
        return;
      }

      longPressTimerRef.current = setTimeout(() => {
        if (!movedRef.current && !dragSelectModeRef.current && !pendingDragSelectRef.current && !twoFingerRef.current && !threeFingerRef.current && wsRef.current?.readyState === 1) {
          longPressFiredRef.current = true;
          send({ type: 'click', button: 'right' });
          const loc = startLocRef.current;
          if (loc) showTapMark(loc.x, loc.y);
        }
      }, LONG_PRESS_MS);
    },
    onPanResponderMove: (evt, gestureState) => {
      const touches = evt.nativeEvent.touches || [];
      if (touches.length >= 3) {
        clearLongPressTimer();
        if (pendingDragSelectRef.current) {
          pendingDragSelectRef.current = false;
          lastTapTimeRef.current = 0;
        }
        if (dragSelectModeRef.current) {
          send({ type: 'up', button: 'left' });
          dragSelectModeRef.current = false;
        }
        threeFingerRef.current = true;
        movedRef.current = true;
        return;
      }
      if (touches.length >= 2) {
        // two-finger scroll
        clearLongPressTimer();
        if (pendingDragSelectRef.current) {
          pendingDragSelectRef.current = false;
          lastTapTimeRef.current = 0;
        }
        if (dragSelectModeRef.current) {
          send({ type: 'up', button: 'left' });
          dragSelectModeRef.current = false;
        }
        twoFingerRef.current = true;
        movedRef.current = true;

        const avgY = touches.reduce((s, t) => s + t.pageY, 0) / touches.length;
        if (lastTwoFingerYRef.current == null) {
          lastTwoFingerYRef.current = avgY;
        } else {
          const deltaY = avgY - lastTwoFingerYRef.current;
          if (Math.abs(deltaY) >= 12) {
            const steps = Math.trunc(deltaY / 12);
            lastTwoFingerYRef.current += steps * 12;
            const dir = scrollReverseRef.current ? 1 : -1;
            send({ type: 'scroll', dx: 0, dy: dir * steps * 120 });
          }
        }
        return;
      }

      const t = touches[0];
      const last = lastTouchRef.current;
      if (!t || !last) return;
      const dx = clampInt(t.pageX - last.x);
      const dy = clampInt(t.pageY - last.y);
      if (dx === 0 && dy === 0) return;

      const start = startTouchRef.current;
      const totalMove = start ? Math.abs(t.pageX - start.x) + Math.abs(t.pageY - start.y) : Math.abs(dx) + Math.abs(dy);
      if (!movedRef.current && totalMove > MOVE_THRESHOLD) {
        clearLongPressTimer();
        movedRef.current = true;
        if (pendingDragSelectRef.current) {
          pendingDragSelectRef.current = false;
          dragSelectModeRef.current = true;
          send({ type: 'down', button: 'left' });
        }
      }

      if (dragSelectModeRef.current) {
        const s = sensitivityRef.current;
        send({ type: 'move', dx: clampInt(dx * s), dy: clampInt(dy * s) });
        lastTouchRef.current = { x: t.pageX, y: t.pageY };
        return;
      }

      if (movedRef.current && !longPressFiredRef.current && !twoFingerRef.current) {
        const s = sensitivityRef.current;
        send({ type: 'move', dx: clampInt(dx * s), dy: clampInt(dy * s) });
      }
      lastTouchRef.current = { x: t.pageX, y: t.pageY };
    },
    onPanResponderRelease: (evt) => {
      clearLongPressTimer();
      const t = evt.nativeEvent.changedTouches?.[0] || evt.nativeEvent.touches?.[0] || evt.nativeEvent;
      const x = (t.pageX ?? t.locationX ?? 0) - (t.pageX != null ? touchpadOriginRef.current.x : 0);
      const y = (t.pageY ?? t.locationY ?? 0) - (t.pageY != null ? touchpadOriginRef.current.y : 0);
      if (threeFingerRef.current) {
        send({ type: 'click', button: 'middle' });
        showTapMark(x, y);
        lastTapTimeRef.current = 0;
      } else if (dragSelectModeRef.current) {
        send({ type: 'up', button: 'left' });
        dragSelectModeRef.current = false;
        lastTapTimeRef.current = 0;
      } else if (pendingDragSelectRef.current) {
        // quick double tap -> second click
        send({ type: 'click', button: 'left' });
        showTapMark(x, y);
        lastTapTimeRef.current = Date.now();
        pendingDragSelectRef.current = false;
      } else if (!movedRef.current && !longPressFiredRef.current && !twoFingerRef.current) {
        send({ type: 'click', button: 'left' });
        showTapMark(x, y);
        lastTapTimeRef.current = Date.now();
      } else {
        lastTapTimeRef.current = 0;
      }
      startTouchRef.current = null;
      lastTouchRef.current = null;
      movedRef.current = false;
      longPressFiredRef.current = false;
      twoFingerRef.current = false;
      lastTwoFingerYRef.current = null;
      threeFingerRef.current = false;
      pendingDragSelectRef.current = false;
    },
    onPanResponderTerminate: () => {
      clearLongPressTimer();
      if (dragSelectModeRef.current) {
        send({ type: 'up', button: 'left' });
      }
      dragSelectModeRef.current = false;
      pendingDragSelectRef.current = false;
      twoFingerRef.current = false;
      lastTwoFingerYRef.current = null;
      threeFingerRef.current = false;
      startTouchRef.current = null;
      lastTouchRef.current = null;
      movedRef.current = false;
      longPressFiredRef.current = false;
      lastTapTimeRef.current = 0;
    },
  }), [clearLongPressTimer, phase, send, settingsOpen, showScrollStrip, showSpace, showTapMark, winH, winW]);

  const scrollResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => phase === 'connected' && !settingsOpen,
    onMoveShouldSetPanResponder: () => phase === 'connected' && !settingsOpen,
    onPanResponderGrant: (evt) => {
      Keyboard.dismiss();
      const t = evt.nativeEvent.touches?.[0];
      lastScrollYRef.current = t ? t.pageY : null;
    },
    onPanResponderMove: (evt) => {
      const t = evt.nativeEvent.touches?.[0];
      if (!t) return;
      const lastY = lastScrollYRef.current;
      if (lastY == null) { lastScrollYRef.current = t.pageY; return; }
      const deltaY = t.pageY - lastY;
      if (Math.abs(deltaY) >= 10) {
        const steps = Math.trunc(deltaY / 10);
        lastScrollYRef.current += steps * 10;
        send({ type: 'scroll', dx: 0, dy: -steps * 120 });
      }
    },
    onPanResponderRelease: () => { lastScrollYRef.current = null; },
    onPanResponderTerminate: () => { lastScrollYRef.current = null; },
  }), [phase, send, settingsOpen]);

  if (phase !== 'connected') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <View style={styles.center}>
          <Image source={theme === 'dark' ? require('./assets/icon.png') : require('./assets/icon-light.png')} style={styles.discoverIcon} />
          <Text style={[styles.title, { color: c.text }]}>Mobile Pad</Text>
          {phase === 'searching' || phase === 'connecting' ? (
            <ActivityIndicator size="large" color={c.accent} style={{ marginTop: 28, transform: [{ scale: 2.2 }] }} />
          ) : phase === 'found' ? (
            <>

              <Pressable
                style={({ pressed }) => [styles.serverCard, { backgroundColor: c.card, borderColor: c.cardBorder }, pressed && { opacity: 0.88, transform: [{ scale: 0.985 }] }]}
                onPress={() => server && connectToServer(server)}
              >
                <View style={[styles.serverIconWrap, { backgroundColor: theme === 'dark' ? 'rgba(78,161,255,0.14)' : 'rgba(197,138,0,0.12)' }]}>
                  <Text style={styles.serverIcon}>🖥️</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.serverName, { color: c.text }]}>{server?.name || 'Computer'}</Text>
                  <Text style={[styles.serverMeta, { color: c.muted }]}>Tap to connect</Text>
                </View>
              </Pressable>
              <Pressable style={styles.linkBtn} onPress={startDiscovery}>
                <Ionicons name="refresh" size={18} color={c.accent} />
                <Text style={[styles.linkBtnText, { color: c.accent }]}>Search again</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.errorIconWrap}><Text style={styles.errorIcon}>!</Text></View>
              <Text style={[styles.message, { color: c.text }]}>Server not found</Text>
              {!!error && <Text style={[styles.subMessage, { color: c.muted }]}>{error}</Text>}
              <Pressable style={[styles.retryBtn, { backgroundColor: c.accentBtn }]} onPress={startDiscovery}>
                <Ionicons name="refresh" size={18} color={c.accentBtnText} />
                <Text style={[styles.retryBtnText, { color: c.accentBtnText }]}>Search again</Text>
              </Pressable>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={[styles.touchRoot, { backgroundColor: c.bg2 }]}>
      <StatusBar hidden />
      <View style={styles.mainRow}>
        <View
          ref={touchpadRef}
          onLayout={updateTouchpadOrigin}
          style={styles.touchArea}
          {...touchpadResponder.panHandlers}
        >
          <LinearGradient
            pointerEvents="none"
            colors={theme === 'dark' ? ['#182233', '#0e1520', '#141f2e'] : ['#fff9e6', '#fff0c2', '#fff6d5']}
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {dots.map((d, i) => (
              <View
                key={`${d.x}-${d.y}-${i}`}
                style={[
                  styles.textureDot,
                  {
                    left: d.x,
                    top: d.y,
                    backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(120,90,20,0.12)',
                  },
                ]}
              />
            ))}
            {tapMark && (
              <Animated.View
                style={[
                  styles.tapMark,
                  {
                    left: tapMark.x - 38,
                    top: tapMark.y - 54,
                    backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.35)' : c.accent + '38',
                    opacity: tapMarkOpacity,
                    transform: [{ scale: tapMarkScale }],
                  },
                ]}
              />
            )}
          </View>
          <Image pointerEvents="none" source={theme === 'dark' ? require('./assets/icon.png') : require('./assets/icon-light.png')} style={[styles.centerIcon, { opacity: theme === 'dark' ? 0.45 : 0.5 }]} />
          <Text pointerEvents="none" style={[styles.centerHint, { color: theme === 'dark' ? 'rgba(255,255,255,0.32)' : 'rgba(90,65,10,0.30)' }]}>Mobile Pad</Text>

          <Pressable
            style={({ pressed }) => [styles.settingsBtn, { backgroundColor: c.settingsBg, borderColor: c.btnBorder }, pressed && { opacity: 0.8, transform: [{ scale: 0.94 }] }]}
            onPress={openSettings}
          >
            <Ionicons name="settings-sharp" size={30} color={c.text} />
          </Pressable>

        </View>

        {showScrollStrip && (
          <View style={[styles.scrollStrip, { backgroundColor: c.stripBg, borderLeftColor: c.stripBorder }]} {...scrollResponder.panHandlers}>
            <Text style={[styles.scrollStripText, { color: c.stripText }]}>Scroll</Text>

          </View>
        )}
      </View>

      <View style={[styles.bottomBar, { backgroundColor: c.bg2, borderTopColor: c.cardBorder }]}>
        <Pressable style={({ pressed }) => [styles.iconBtn, { backgroundColor: c.btnBg, borderColor: c.btnBorder }, pressed && { opacity: 0.82, transform: [{ scale: 0.95 }] }]} onPress={openKeyboard}>
          <Text style={[styles.iconBtnText, { color: c.btnText }]}>⌨</Text>
        </Pressable>
        {showSpace && (
          <Pressable style={({ pressed }) => [styles.spaceBtn, { backgroundColor: c.btnBg, borderColor: c.btnBorder }, pressed && { opacity: 0.82, transform: [{ scale: 0.98 }] }]} onPress={() => send({ type: 'key', key: 'space' })}>
            <Text style={[styles.spaceBtnText, { color: c.btnText }]}>Space</Text>
          </Pressable>
        )}
        <Pressable style={({ pressed }) => [styles.iconBtn, { backgroundColor: c.btnBg, borderColor: c.btnBorder }, pressed && { opacity: 0.82, transform: [{ scale: 0.95 }] }]} onPress={openShortcuts}>
          <Text style={[styles.iconBtnText, { color: c.btnText }]}>⚡</Text>
        </Pressable>
      </View>

      <TextInput
        ref={keyboardRef}
        value={keyboardValue}
        onChangeText={onKeyboardChange}
        onSubmitEditing={onKeyboardSubmit}
        autoCorrect={false}
        autoCapitalize="none"
        style={styles.hiddenInput}
      />

      <Modal visible={modalVisible} transparent animationType="none" statusBarTranslucent onRequestClose={closeSettings}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSettings}>
            <Animated.View style={[StyleSheet.absoluteFill, styles.modalBackdropBg, { backgroundColor: c.modalBg, opacity: modalAnim }]} />
          </Pressable>

          <Animated.View
            style={[
              styles.modalCard,
              {
                backgroundColor: c.card,
                borderColor: c.cardBorder,
                opacity: modalAnim,
                transform: [
                  { translateY: modalAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
                  { scale: modalAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
                ],
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <Text style={[styles.modalTitle, { color: c.text, marginBottom: 0 }]}>Settings</Text>
              <Pressable onPress={closeSettings} hitSlop={8} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={24} color={c.text} />
              </Pressable>
            </View>
            <SensitivitySlider value={sensitivity} onCommit={setSensitivity} c={c} />

            <View style={[styles.toggleRow, { borderTopColor: c.cardBorder }]}>
              <Text style={[styles.toggleLabel, { color: c.text }]}>Dark mode</Text>
              <Switch
                value={theme === 'dark'}
                onValueChange={(v) => setTheme(v ? 'dark' : 'light')}
                trackColor={{ false: '#b8c7d9', true: '#4ea1ff' }}
                thumbColor="#f3f7fb"
              />
            </View>
            <View style={[styles.toggleRow, { borderTopColor: c.cardBorder }]}>
              <Text style={[styles.toggleLabel, { color: c.text }]}>Show Space button</Text>
              <Switch
                value={showSpace}
                onValueChange={setShowSpace}
                trackColor={{ false: '#b8c7d9', true: '#4ea1ff' }}
                thumbColor="#f3f7fb"
              />
            </View>
            <View style={[styles.toggleRow, { borderTopColor: c.cardBorder }]}>
              <Text style={[styles.toggleLabel, { color: c.text }]}>Show Scroll area</Text>
              <Switch
                value={showScrollStrip}
                onValueChange={setShowScrollStrip}
                trackColor={{ false: '#b8c7d9', true: '#4ea1ff' }}
                thumbColor="#f3f7fb"
              />
            </View>
            <View style={[styles.toggleRow, { borderTopColor: c.cardBorder }]}>
              <Text style={[styles.toggleLabel, { color: c.text }]}>Reverse scroll</Text>
              <Switch
                value={scrollReverse}
                onValueChange={setScrollReverse}
                trackColor={{ false: '#b8c7d9', true: '#4ea1ff' }}
                thumbColor="#f3f7fb"
              />
            </View>

            <Pressable
              style={[styles.closeBtn, { backgroundColor: '#ff5d5d', marginTop: 0 }]}
              onPress={() => {
                closeSettings();
                setTimeout(() => { startDiscovery(); }, 220);
              }}
            >
              <Text style={[styles.closeBtnText, { color: '#fff' }]}>Disconnect</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>

      <Modal visible={shortcutsModalVisible} transparent animationType="none" statusBarTranslucent onRequestClose={closeShortcuts}>
        <View style={styles.sheetRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeShortcuts}>
            <Animated.View style={[StyleSheet.absoluteFill, styles.modalBackdropBg, { backgroundColor: c.modalBg, opacity: shortcutsAnim }]} />
          </Pressable>
          <Animated.View
            style={[
              styles.sheetCard,
              { backgroundColor: c.card, borderColor: c.cardBorder },
              {
                opacity: shortcutsAnim,
                transform: [
                  { translateY: shortcutsAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
                  { scale: shortcutsAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
                ],
              },
            ]}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={styles.sheetHandle} />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <Text style={[styles.modalTitle, { color: c.text, marginBottom: 0 }]}>Shortcuts</Text>
                <Pressable onPress={closeShortcuts} hitSlop={8} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="close" size={24} color={c.text} />
                </Pressable>
              </View>
              <ScrollView style={{ maxHeight: winW > winH ? 170 : 248 }} showsVerticalScrollIndicator={false}>
                <View style={styles.shortcutGrid}>
                  {shortcuts.map((s, idx) => {
                    const holdable = s.type === 'key' || s.type === 'click' || (!s.modifiers?.length && !!s.key);
                    return (
                      <Pressable
                        key={`${s.label}-${idx}`}
                        style={({ pressed }) => [styles.shortcutTile, { backgroundColor: c.inputBg, borderColor: c.inputBorder }, pressed && { opacity: 0.78, transform: [{ scale: 0.95 }] }]}
                        onPressIn={holdable ? () => {
                          if (s.type === 'click') send({ type: 'down', button: s.button });
                          else send({ type: 'down', key: s.key });
                        } : undefined}
                        onPressOut={holdable ? () => {
                          if (s.type === 'click') send({ type: 'up', button: s.button });
                          else send({ type: 'up', key: s.key });
                        } : undefined}
                        onPress={!holdable ? () => {
                          send({ type: 'shortcut', modifiers: s.modifiers || [], key: s.key });
                        } : undefined}
                      >
                        {s.icon ? (
                          <Ionicons name={s.icon} size={24} color={c.text} />
                        ) : (
                          <Text style={[styles.shortcutTileText, { color: c.text }]}>{s.label}</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f141b' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  discoverIcon: { width: 80, height: 80, borderRadius: 20, marginBottom: 14 },
  title: { color: '#f3f7fb', fontSize: 34, fontWeight: '800', marginBottom: 24 },
  loader: { marginBottom: 18 },
  message: { color: '#e7eef7', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  subMessage: { color: '#97a8bc', fontSize: 14, textAlign: 'center', marginTop: 10, lineHeight: 20, maxWidth: 320 },
  errorIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,93,93,0.14)', borderWidth: 1, borderColor: 'rgba(255,93,93,0.35)', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  errorIcon: { color: '#ff7b7b', fontSize: 28, fontWeight: '800' },
  retryBtn: { marginTop: 24, backgroundColor: '#4ea1ff', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  retryBtnText: { color: '#08111d', fontSize: 15, fontWeight: '700' },
  serverCard: { width: '100%', maxWidth: 340, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16, borderWidth: 1 },
  serverIconWrap: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  serverIcon: { fontSize: 28 },
  serverName: { fontSize: 17, fontWeight: '700' },
  serverMeta: { fontSize: 13, marginTop: 4 },
  linkBtn: { marginTop: 18, paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  linkBtnText: { fontSize: 14, fontWeight: '600' },

  touchRoot: { flex: 1, backgroundColor: '#0b1017' },
  mainRow: { flex: 1, flexDirection: 'row' },
  touchArea: { flex: 1, backgroundColor: '#0b1017', alignItems: 'center', justifyContent: 'center' },
  centerIcon: { width: 88, height: 88, borderRadius: 22, marginBottom: 14 },
  centerHint: { color: 'rgba(231,238,247,0.16)', fontSize: 32, fontWeight: '700', letterSpacing: 0.5 },
  textureDot: { position: 'absolute', width: 3, height: 3, borderRadius: 1.5 },
  tapMark: { position: 'absolute', width: 76, height: 76, borderRadius: 38 },

  settingsBtn: {
    position: 'absolute',
    top: 34,
    left: 18,
    width: 72,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(24,33,45,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(78,161,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  settingsBtnText: { color: 'rgba(201,214,229,0.8)', fontSize: 22 },


  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  iconBtn: {
    width: 72,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(24,33,45,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(78,161,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { fontSize: 30 },
  spaceBtn: {
    flex: 1,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(24,33,45,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(78,161,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spaceBtnText: { color: 'rgba(231,238,247,0.82)', fontSize: 20, fontWeight: '700', letterSpacing: 0.5 },
  hiddenInput: { position: 'absolute', bottom: -100, left: 0, width: 1, height: 1, opacity: 0 },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderBottomWidth: 0, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28 },
  sheetHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: 'rgba(150,160,175,0.45)', alignSelf: 'center', marginBottom: 12 },
  shortcutGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  shortcutTile: { width: '31%', minWidth: 72, height: 64, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  shortcutTileText: { fontSize: 15, fontWeight: '700' },

  scrollStrip: {
    width: SCROLL_STRIP_WIDTH,
    backgroundColor: '#111924',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(78,161,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  scrollStripText: {
    color: 'rgba(102,170,255,0.55)',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    transform: [{ rotate: '90deg' }],
    width: 140,
    textAlign: 'center',
  },
  modalRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalBackdropBg: { backgroundColor: 'rgba(0,0,0,0.56)' },
  modalCard: { width: '100%', maxWidth: 360, backgroundColor: '#18212d', borderRadius: 16, borderWidth: 1, borderColor: '#273445', padding: 20 },
  modalTitle: { color: '#f3f7fb', fontSize: 22, fontWeight: '700', marginBottom: 18 },
  modalLabel: { color: '#9aa8ba', fontSize: 14, marginBottom: 12 },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  sliderTrackWrap: { flex: 1, height: 40, justifyContent: 'center' },
  sliderTrack: { height: 8, borderRadius: 4, borderWidth: 1, overflow: 'hidden' },
  sliderFill: { height: '100%' },
  sliderThumb: { position: 'absolute', width: 22, height: 22, borderRadius: 11, marginLeft: -11, top: 9 },
  resetBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#273445' },
  toggleLabel: { color: '#d7e3f1', fontSize: 14, fontWeight: '600' },
  closeBtn: { backgroundColor: '#4ea1ff', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 14 },
  closeBtnText: { color: '#08111d', fontWeight: '700', fontSize: 15 },
});
