package tui

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
)

var colors = map[byte]lipgloss.TerminalColor{
	'O': lipgloss.AdaptiveColor{Light: "#b85c37", Dark: "#D4704B"}, // Orange
	'D': lipgloss.AdaptiveColor{Light: "#8a3c20", Dark: "#A65030"}, // Dark Orange Shading
	'W': lipgloss.AdaptiveColor{Light: "#eaeaea", Dark: "#FFFFFF"}, // White
	'B': lipgloss.AdaptiveColor{Light: "#3d3529", Dark: "#1c1c1c"}, // Black/Dark Brown
	'e': lipgloss.AdaptiveColor{Light: "#3d3529", Dark: "#1c1c1c"},
	'n': lipgloss.AdaptiveColor{Light: "#3d3529", Dark: "#1c1c1c"},
}

const FoxMap = `............BBBBBBBB....
..........BBOOOOOOOOBB..
......BB..BOOOOOOOOOOOB.
.....BOOB.BDOOOOOOOOOOB.
....BOOOOBBDDOOOOOOOOOB.
...BDOOOOOOOOOOOOOOOOOB.
...BOeOOOOOOOOOOOOOOOOB.
..BDOOOOOOOOOOOOOOOOOOB.
..BnOOOOOOOOOOOOOOOOOBB.
..BWWWWWOOOOOOOOOOOOBWB.
...BBWWWOOOOOOOOOOOBWWB.
.....BDOOOOOOOOOOOBWWWB.
.....BDOOOOOOOOOOBWWWWB.
....BDOOOOOOOOOOBWWWWWB.
....BDOOOOOOOOOOBWWWWBB.
...BDOOOOOOOODDBWWBB....
..BDDDBBBOOOOBBDBB......
..BBBB..BBBB..BBB.......`

var LogoLines = []string{
	"█████╗ ███╗   ██╗███╗   ██╗ ██████╗",
	"██╔══██╗████╗  ██║████╗  ██║██╔════╝",
	"███████║██╔██╗ ██║██╔██╗ ██║██║  ███╗",
	"██╔══██║██║╚██╗██║██║╚██╗██║██║   ██║",
	"██║  ██║██║ ╚████║██║ ╚████║╚██████╔╝",
	"╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═══╝ ╚═════╝",
}

func RenderMascot(width int) string {
	lines := strings.Split(FoxMap, "\n")
	var result []string

	for r := 0; r < len(lines); r += 2 {
		upperRow := lines[r]
		var lowerRow string
		if r+1 < len(lines) {
			lowerRow = lines[r+1]
		} else {
			lowerRow = strings.Repeat(".", len(upperRow))
		}

		rowStr := ""
		for i := 0; i < len(upperRow); i++ {
			u := upperRow[i]
			l := lowerRow[i]
			colorU, existsU := colors[u]
			colorL, existsL := colors[l]

			if u == l {
				if existsU {
					style := lipgloss.NewStyle().Foreground(colorU)
					rowStr += style.Render("█")
				} else {
					rowStr += " "
				}
			} else if existsU && !existsL {
				style := lipgloss.NewStyle().Foreground(colorU)
				rowStr += style.Render("▀")
			} else if !existsU && existsL {
				style := lipgloss.NewStyle().Foreground(colorL)
				rowStr += style.Render("▄")
			} else if existsU && existsL {
				style := lipgloss.NewStyle().Foreground(colorU).Background(colorL)
				rowStr += style.Render("▀")
			}
		}

		if r/2 >= 1 && r/2 <= 6 {
			logoStyle := lipgloss.NewStyle().Foreground(colorBrandOrange)
			rowStr += " " + logoStyle.Render(LogoLines[r/2-1])
		}
		result = append(result, rowStr)
	}
	return strings.Join(result, "\n")
}
