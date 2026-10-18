//go:build windows

package proc

import (
	"os/exec"
	"syscall"
)

// createNoWindow keeps a console program from opening a console window
// when a GUI app starts it.
const createNoWindow = 0x08000000

func hideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
}
