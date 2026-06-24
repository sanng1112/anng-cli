package tools

import (
	"fmt"
	"os/exec"
	"sync"
)

type BackgroundTask struct {
	ID      string    `json:"id"`
	Command string    `json:"command"`
	Cmd     *exec.Cmd `json:"-"`
	Running bool      `json:"running"`
}

type TaskManager struct {
	sync.Mutex
	tasks map[string]*BackgroundTask
}

var globalTaskManager *TaskManager
var once sync.Once

func GetTaskManager() *TaskManager {
	once.Do(func() {
		globalTaskManager = NewTaskManager()
	})
	return globalTaskManager
}

func NewTaskManager() *TaskManager {
	return &TaskManager{
		tasks: make(map[string]*BackgroundTask),
	}
}

func (tm *TaskManager) StartTask(id string, cmdStr string, projectRoot string) error {
	tm.Lock()
	defer tm.Unlock()

	cmd := exec.Command("bash", "-c", cmdStr)
	cmd.Dir = projectRoot

	task := &BackgroundTask{
		ID:      id,
		Command: cmdStr,
		Cmd:     cmd,
		Running: true,
	}

	err := cmd.Start()
	if err != nil {
		task.Running = false
		return err
	}

	tm.tasks[id] = task

	// Monitor process exit in background
	go func() {
		_ = cmd.Wait()
		tm.Lock()
		defer tm.Unlock()
		task.Running = false
	}()

	return nil
}

func (tm *TaskManager) KillTask(id string) error {
	tm.Lock()
	defer tm.Unlock()

	task, exists := tm.tasks[id]
	if !exists {
		return fmt.Errorf("task %s not found", id)
	}

	if task.Cmd != nil && task.Cmd.Process != nil && task.Running {
		err := task.Cmd.Process.Kill()
		if err != nil {
			return err
		}
	}
	task.Running = false
	return nil
}

func (tm *TaskManager) GetTask(id string) (*BackgroundTask, bool) {
	tm.Lock()
	defer tm.Unlock()
	task, exists := tm.tasks[id]
	return task, exists
}

func (tm *TaskManager) ListTasks() []*BackgroundTask {
	tm.Lock()
	defer tm.Unlock()
	var list []*BackgroundTask
	for _, t := range tm.tasks {
		list = append(list, t)
	}
	return list
}
