package tui

type InputBuffer struct {
	runes  []rune
	cursor int
}

func NewInputBuffer() *InputBuffer {
	return &InputBuffer{
		runes:  []rune{},
		cursor: 0,
	}
}

func (ib *InputBuffer) Clear() {
	ib.runes = []rune{}
	ib.cursor = 0
}

func (ib *InputBuffer) GetText() string {
	return string(ib.runes)
}

func (ib *InputBuffer) Insert(text string) {
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
		ib.runes = append(ib.runes[:ib.cursor-1], ib.runes[ib.cursor:]...)
		ib.cursor--
	}
}

func (ib *InputBuffer) Delete() {
	if ib.cursor < len(ib.runes) {
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

func (ib *InputBuffer) DeleteWordBefore() {
	if ib.cursor == 0 {
		return
	}
	start := ib.cursor
	ib.MoveWordLeft()
	ib.runes = append(ib.runes[:ib.cursor], ib.runes[start:]...)
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
