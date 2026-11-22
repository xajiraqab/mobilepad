package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var trayIcon []byte

func init() {
	application.RegisterEvent[ServerStatus]("server:status")
}

func main() {
	serverService := NewServerService()

	app := application.New(application.Options{
		Name:        "Mobile Pad",
		Description: "MobilePad touchpad server",
		Services: []application.Service{
			application.NewService(serverService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	serverService.SetApp(app)

	go func() {
		_, _ = serverService.StartServer()
	}()

	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:               "Mobile Pad",
		Width:               560,
		Height:              640,
		DisableResize:       true,
		MaximiseButtonState: application.ButtonDisabled,
		BackgroundColour:    application.NewRGB(18, 20, 24),
		URL:                 "/",
	})
	serverService.SetWindow(window)

	systray := app.SystemTray.New()
	systray.SetLabel("Mobile Pad")
	systray.SetTooltip("Mobile Pad")
	if len(trayIcon) > 0 {
		systray.SetIcon(trayIcon)
	}
	systray.OnClick(func() {
		if window.IsVisible() {
			window.Hide()
		} else {
			window.Show().Focus()
		}
	})

	trayMenu := app.NewMenu()
	trayMenu.Add("Exit").OnClick(func(*application.Context) {
		app.Quit()
	})
	systray.SetMenu(trayMenu)

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
