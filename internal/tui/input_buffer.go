package tui

type InputBuffer struct {
	runes      []rune
	cursor     int
	history    []string
	historyIdx int
	tempBuffer string
	undoStack  [][]rune
	redoStack  [][]rune
}

func NewInputBuffer() *InputBuffer {
	return &InputBuffer{
		runes:      []rune{},
		cursor:     0,
		history:    []string{},
		historyIdx: -1,
		undoStack:  [][]rune{},
		redoStack:  [][]rune{},
	}
}

func (ib *InputBuffer) Clear() {
	ib.runes = []rune{}
	ib.cursor = 0
	ib.historyIdx = -1
	ib.undoStack = [][]rune{}
	ib.redoStack = [][]rune{}
}

func (ib *InputBuffer) GetText() string {
	return string(ib.runes)
}

func (ib *InputBuffer) Insert(text string) {
	ib.PushUndo()
	newRunes := []rune(text)
	tail := append([]rune{}, ib.runes[ib.cursor:]...)
	ib.runes = append(ib.runes[:ib.cursor], newRunes...)
	ib.runes = append(ib.runes, tail...)
	ib.cursor += len(newRunes)
}

func (ib *InputBuffer) MoveLeft() {
	if ib.cursor > 0 {
		ib.cursor--
	}
}

func (ib *InputBuffer) MoveRight() {
	if ib.cursor < len(ib.runes) {
		ib.cursor++
	}
}

func (ib *InputBuffer) Backspace() {
	if ib.cursor > 0 {
		ib.PushUndo()
		ib.runes = append(ib.runes[:ib.cursor-1], ib.runes[ib.cursor:]...)
		ib.cursor--
	}
}

func (ib *InputBuffer) Delete() {
	if ib.cursor < len(ib.runes) {
		ib.PushUndo()
		ib.runes = append(ib.runes[:ib.cursor], ib.runes[ib.cursor+1:]...)
	}
}

func (ib *InputBuffer) MoveWordLeft() {
	if ib.cursor == 0 {
		return
	}
	idx := ib.cursor - 1
	for idx > 0 && ib.runes[idx] == ' ' {
		idx--
	}
	for idx > 0 && ib.runes[idx] != ' ' {
		idx--
	}
	if idx > 0 && ib.runes[idx] == ' ' {
		idx++
	}
	ib.cursor = idx
}

func (ib *InputBuffer) MoveWordRight() {
	if ib.cursor >= len(ib.runes) {
		return
	}
	idx := ib.cursor
	for idx < len(ib.runes) && ib.runes[idx] == ' ' {
		idx++
	}
	for idx < len(ib.runes) && ib.runes[idx] != ' ' {
		idx++
	}
	ib.cursor = idx
}

func (ib *InputBuffer) DeleteWordBefore() {
	if ib.cursor == 0 {
		return
	}
	ib.PushUndo()
	start := ib.cursor
	ib.MoveWordLeft()
	ib.runes = append(ib.runes[:ib.cursor], ib.runes[start:]...)
}

func (ib *InputBuffer) PushUndo() {
	bufCopy := make([]rune, len(ib.runes))
	copy(bufCopy, ib.runes)
	ib.undoStack = append(ib.undoStack, bufCopy)
	if len(ib.undoStack) > 50 {
		ib.undoStack = ib.undoStack[1:]
	}
	ib.redoStack = [][]rune{}
}

func (ib *InputBuffer) Undo() {
	if len(ib.undoStack) == 0 {
		return
	}
	current := make([]rune, len(ib.runes))
	copy(current, ib.runes)
	ib.redoStack = append(ib.redoStack, current)

	lastIdx := len(ib.undoStack) - 1
	ib.runes = ib.undoStack[lastIdx]
	ib.undoStack = ib.undoStack[:lastIdx]
	ib.cursor = len(ib.runes)
}

func (ib *InputBuffer) Redo() {
	if len(ib.redoStack) == 0 {
		return
	}
	current := make([]rune, len(ib.runes))
	copy(current, ib.runes)
	ib.undoStack = append(ib.undoStack, current)

	lastIdx := len(ib.redoStack) - 1
	ib.runes = ib.redoStack[lastIdx]
	ib.redoStack = ib.redoStack[:lastIdx]
	ib.cursor = len(ib.runes)
}

func (ib *InputBuffer) SetCursor(pos int) {
	if pos < 0 {
		ib.cursor = 0
	} else if pos > len(ib.runes) {
		ib.cursor = len(ib.runes)
	} else {
		ib.cursor = pos
	}
}

func (ib *InputBuffer) GetCursor() int {
	return ib.cursor
}
