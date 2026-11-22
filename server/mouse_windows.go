//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

var (
	user32               = syscall.NewLazyDLL("user32.dll")
	procSendInput        = user32.NewProc("SendInput")
	procSetCursorPos     = user32.NewProc("SetCursorPos")
	procGetSystemMetrics = user32.NewProc("GetSystemMetrics")
)

const (
	inputMouse      = 0
	inputKeyboard   = 1
	mouseMove       = 0x0001
	mouseLeftDown   = 0x0002
	mouseLeftUp     = 0x0004
	mouseRightDown  = 0x0008
	mouseRightUp    = 0x0010
	mouseMiddleDown = 0x0020
	mouseMiddleUp   = 0x0040
	mouseWheel      = 0x0800
	mouseHWheel     = 0x1000
	keyUp           = 0x0002
	keyUnicode      = 0x0004
	vkBack          = 0x08
	vkTab           = 0x09
	vkReturn        = 0x0D
	vkShift         = 0x10
	vkControl       = 0x11
	vkMenu          = 0x12 // Alt
	vkEscape        = 0x1B
	vkSpace         = 0x20
	vkLeft          = 0x25
	vkUp            = 0x26
	vkRight         = 0x27
	vkDown          = 0x28
	vkDelete        = 0x2E
	vkLWin          = 0x5B
)

type mouseInput struct {
	dx        int32
	dy        int32
	mouseData uint32
	dwFlags   uint32
	time      uint32
	dwExtra   uintptr
}

type input struct {
	inputType uint32
	_         uint32 // padding for alignment on 64-bit
	mi        mouseInput
}

type keyboardInput struct {
	wVk     uint16
	wScan   uint16
	dwFlags uint32
	time    uint32
	dwExtra uintptr
}

type keyInput struct {
	inputType uint32
	_         uint32
	ki        keyboardInput
	_         [8]byte // pad union to match mouseInput size on 64-bit
}

func sendMouse(flags uint32, data uint32, dx, dy int32) {
	var in input
	in.inputType = inputMouse
	in.mi.dx = dx
	in.mi.dy = dy
	in.mi.mouseData = data
	in.mi.dwFlags = flags
	size := unsafe.Sizeof(in)
	procSendInput.Call(1, uintptr(unsafe.Pointer(&in)), size)
}

func moveCursor(dx, dy int32) {
	if dx == 0 && dy == 0 {
		return
	}
	sendMouse(mouseMove, 0, dx, dy)
}

func click(button string) {
	down, up := buttonFlags(button)
	if down == 0 {
		return
	}
	sendMouse(down, 0, 0, 0)
	sendMouse(up, 0, 0, 0)
}

func mouseDown(button string) {
	down, _ := buttonFlags(button)
	if down == 0 {
		return
	}
	sendMouse(down, 0, 0, 0)
}

func mouseUp(button string) {
	_, up := buttonFlags(button)
	if up == 0 {
		return
	}
	sendMouse(up, 0, 0, 0)
}

func scroll(dx, dy int32) {
	if dy != 0 {
		sendMouse(mouseWheel, uint32(dy), 0, 0)
	}
	if dx != 0 {
		sendMouse(mouseHWheel, uint32(dx), 0, 0)
	}
}

func buttonFlags(button string) (uint32, uint32) {
	switch button {
	case "left":
		return mouseLeftDown, mouseLeftUp
	case "right":
		return mouseRightDown, mouseRightUp
	case "middle":
		return mouseMiddleDown, mouseMiddleUp
	default:
		return 0, 0
	}
}

func keyNameToVK(name string) uint16 {
	switch name {
	case "space":
		return vkSpace
	case "backspace":
		return vkBack
	case "enter", "return":
		return vkReturn
	case "tab":
		return vkTab
	case "escape", "esc":
		return vkEscape
	case "delete", "del":
		return vkDelete
	case "left":
		return vkLeft
	case "up":
		return vkUp
	case "right":
		return vkRight
	case "down":
		return vkDown
	case "shift":
		return vkShift
	case "ctrl", "control":
		return vkControl
	case "alt", "menu":
		return vkMenu
	case "win", "meta", "cmd":
		return vkLWin
	default:
		if len(name) == 1 {
			c := name[0]
			if c >= 'a' && c <= 'z' {
				return uint16(c - 'a' + 'A')
			}
			if c >= 'A' && c <= 'Z' {
				return uint16(c)
			}
			if c >= '0' && c <= '9' {
				return uint16(c)
			}
		}
		return 0
	}
}

func tapKey(name string) {
	vk := keyNameToVK(name)
	if vk == 0 {
		return
	}
	sendKey(vk, 0)
	sendKey(vk, keyUp)
}

func keyDown(name string) {
	vk := keyNameToVK(name)
	if vk == 0 {
		return
	}
	sendKey(vk, 0)
}

func keyRelease(name string) {
	vk := keyNameToVK(name)
	if vk == 0 {
		return
	}
	sendKey(vk, keyUp)
}

func sendShortcut(modifiers []string, key string) {
	mods := make([]uint16, 0, len(modifiers))
	for _, m := range modifiers {
		vk := keyNameToVK(m)
		if vk != 0 {
			mods = append(mods, vk)
		}
	}
	keyVK := keyNameToVK(key)
	if keyVK == 0 {
		return
	}
	for _, vk := range mods {
		sendKey(vk, 0)
	}
	sendKey(keyVK, 0)
	sendKey(keyVK, keyUp)
	for i := len(mods) - 1; i >= 0; i-- {
		sendKey(mods[i], keyUp)
	}
}

func sendKey(vk uint16, flags uint32) {
	var in keyInput
	in.inputType = inputKeyboard
	in.ki.wVk = vk
	in.ki.dwFlags = flags
	size := unsafe.Sizeof(in)
	procSendInput.Call(1, uintptr(unsafe.Pointer(&in)), size)
}

func typeText(text string) {
	for _, r := range text {
		if r > 0xFFFF {
			// surrogate pair
			r1 := uint16(((r - 0x10000) >> 10) + 0xD800)
			r2 := uint16(((r - 0x10000) & 0x3FF) + 0xDC00)
			sendUnicode(uint16(r1), false)
			sendUnicode(uint16(r1), true)
			sendUnicode(uint16(r2), false)
			sendUnicode(uint16(r2), true)
			continue
		}
		sendUnicode(uint16(r), false)
		sendUnicode(uint16(r), true)
	}
}

func sendUnicode(scan uint16, keyRelease bool) {
	var in keyInput
	in.inputType = inputKeyboard
	in.ki.wVk = 0
	in.ki.wScan = scan
	in.ki.dwFlags = keyUnicode
	if keyRelease {
		in.ki.dwFlags |= keyUp
	}
	size := unsafe.Sizeof(in)
	procSendInput.Call(1, uintptr(unsafe.Pointer(&in)), size)
}
