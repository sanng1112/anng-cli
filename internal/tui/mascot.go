package tui

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
)

var colors = map[byte]string{
	'O': "#D4704B", // Orange
	'D': "#A65030", // Dark Orange Shading
	'W': "#FFFFFF", // White
	'B': "#000000", // Black
	'e': "#000000",
	'n': "#000000",
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
			colorU := colors[u]
			colorL := colors[l]

			if u == l {
				if colorU != "" {
					style := lipgloss.NewStyle().Foreground(lipgloss.Color(colorU))
					rowStr += style.Render("█")
				} else {
					rowStr += " "
				}
			} else if colorU != "" && colorL == "" {
				style := lipgloss.NewStyle().Foreground(lipgloss.Color(colorU))
				rowStr += style.Render("▀")
			} else if colorU == "" && colorL != "" {
				style := lipgloss.NewStyle().Foreground(lipgloss.Color(colorL))
				rowStr += style.Render("▄")
			} else if colorU != "" && colorL != "" {
				style := lipgloss.NewStyle().Foreground(lipgloss.Color(colorU)).Background(lipgloss.Color(colorL))
				rowStr += style.Render("▀")
			}
		}

		if r/2 >= 1 && r/2 <= 6 {
			logoStyle := lipgloss.NewStyle().Foreground(lipgloss.Color(BrandOrangeColor))
			rowStr += " " + logoStyle.Render(LogoLines[r/2-1])
		}
		result = append(result, rowStr)
	}
	return strings.Join(result, "\n")
}
