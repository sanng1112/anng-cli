package tools

import (
	"testing"
	"time"
)

func TestTaskManagerLifecycle(t *testing.T) {
	tm := NewTaskManager()

	// Khởi động một task chạy ngầm đơn giản
	err := tm.StartTask("task-1", "sleep 10", "/tmp")
	if err != nil {
		t.Fatalf("Failed to start task: %v", err)
	}

	task, exists := tm.GetTask("task-1")
	if !exists {
		t.Fatal("Task should exist in registry")
	}
	if !task.Running {
		t.Error("Task should be marked as running")
	}

	// Đọc danh sách các task
	list := tm.ListTasks()
	if len(list) != 1 || list[0].ID != "task-1" {
		t.Errorf("Expected 1 task in list, got: %v", list)
	}

	// Dừng/Kill task
	err = tm.KillTask("task-1")
	if err != nil {
		t.Fatalf("Failed to kill task: %v", err)
	}

	time.Sleep(100 * time.Millisecond) // Đợi tiến trình dừng hẳn
	
	task, _ = tm.GetTask("task-1")
	if task.Running {
		t.Error("Task should not be running after KillTask")
	}
}
