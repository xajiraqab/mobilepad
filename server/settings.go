package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type Settings struct {
	Port int    `json:"port"`
	Host string `json:"host"`
}

func defaultSettings() Settings {
	return Settings{
		Port: 8765,
		Host: "0.0.0.0",
	}
}

func settingsPath() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	dir := filepath.Dir(exe)
	return filepath.Join(dir, "mobilepad.config.json"), nil
}

func loadSettings() Settings {
	s := defaultSettings()
	path, err := settingsPath()
	if err != nil {
		return s
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return s
	}
	if err := json.Unmarshal(data, &s); err != nil {
		return defaultSettings()
	}
	if s.Port <= 0 || s.Port > 65535 {
		s.Port = 8765
	}
	if s.Host == "" {
		s.Host = "0.0.0.0"
	}
	return s
}

func saveSettings(s Settings) error {
	if s.Port <= 0 || s.Port > 65535 {
		s.Port = 8765
	}
	if s.Host == "" {
		s.Host = "0.0.0.0"
	}
	path, err := settingsPath()
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}
