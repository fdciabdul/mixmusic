// Command genicon draws the MixMusic icons: the app icon and the tray icon.
//
//	go run ./tools/genicon
//
// It writes resources/icon.png (1024×1024) and resources/tray.png (32×32).
package main

import (
	"image"
	"image/color"
	"image/png"
	"log"
	"math"
	"os"
	"path/filepath"
)

// supersample is how many samples per axis each pixel averages.
const supersample = 4

var (
	from = rgb(0x7c, 0x5c, 0xff) // violet, top left
	to   = rgb(0xff, 0x5a, 0x7a) // coral, bottom right
)

type fcolor struct{ r, g, b, a float64 }

func rgb(r, g, b uint8) fcolor {
	return fcolor{float64(r) / 255, float64(g) / 255, float64(b) / 255, 1}
}

func main() {
	if err := os.MkdirAll("resources", 0o755); err != nil {
		log.Fatal(err)
	}
	write(filepath.Join("resources", "icon.png"), draw(1024, 0.86))
	write(filepath.Join("resources", "tray.png"), draw(32, 1))
}

func write(path string, img image.Image) {
	f, err := os.Create(path)
	if err != nil {
		log.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, img); err != nil {
		log.Fatal(err)
	}
	log.Println("wrote", path)
}

// draw renders the icon at size pixels; scale is the share of the canvas
// the rounded square covers.
func draw(size int, scale float64) image.Image {
	img := image.NewNRGBA(image.Rect(0, 0, size, size))
	n := float64(size)
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			var acc fcolor
			for sy := 0; sy < supersample; sy++ {
				for sx := 0; sx < supersample; sx++ {
					// Normalized coordinates in [-1, 1].
					u := (float64(x)+(float64(sx)+0.5)/supersample)/n*2 - 1
					v := (float64(y)+(float64(sy)+0.5)/supersample)/n*2 - 1
					c := sample(u/scale, v/scale)
					acc.r += c.r * c.a
					acc.g += c.g * c.a
					acc.b += c.b * c.a
					acc.a += c.a
				}
			}
			samples := float64(supersample * supersample)
			if acc.a == 0 {
				continue
			}
			img.SetNRGBA(x, y, color.NRGBA{
				R: uint8(math.Round(acc.r / acc.a * 255)),
				G: uint8(math.Round(acc.g / acc.a * 255)),
				B: uint8(math.Round(acc.b / acc.a * 255)),
				A: uint8(math.Round(acc.a / samples * 255)),
			})
		}
	}
	return img
}

// sample returns the color at (u, v), both in [-1, 1] across the square.
func sample(u, v float64) fcolor {
	if !inRoundedSquare(u, v, 0.44) {
		return fcolor{}
	}
	t := clamp((u+v)/4 + 0.5)
	c := fcolor{lerp(from.r, to.r, t), lerp(from.g, to.g, t), lerp(from.b, to.b, t), 1}

	// Two overlapping rings: one for each service, mixed in the middle.
	const radius, width, offset = 0.42, 0.11, 0.24
	left := math.Hypot(u+offset, v)
	right := math.Hypot(u-offset, v)
	white := fcolor{1, 1, 1, 1}
	if left < radius && right < radius {
		c = over(c, white, 0.18)
	}
	if math.Abs(left-radius) < width/2 {
		c = over(c, white, 0.95)
	}
	if math.Abs(right-radius) < width/2 {
		c = over(c, white, 0.78)
	}
	// A play triangle where the rings meet.
	if inTriangle(u, v, 0.11) {
		c = over(c, white, 1)
	}
	return c
}

func inRoundedSquare(u, v, r float64) bool {
	dx := math.Max(math.Abs(u)-(1-r), 0)
	dy := math.Max(math.Abs(v)-(1-r), 0)
	return math.Abs(u) <= 1 && math.Abs(v) <= 1 && dx*dx+dy*dy <= r*r
}

// inTriangle reports whether (u, v) is inside a right-pointing triangle of
// half-height h centered on the origin.
func inTriangle(u, v, h float64) bool {
	left, right := -h*0.75, h*1.05
	if u < left || u > right {
		return false
	}
	return math.Abs(v) <= h*(right-u)/(right-left)
}

func over(dst, src fcolor, alpha float64) fcolor {
	return fcolor{lerp(dst.r, src.r, alpha), lerp(dst.g, src.g, alpha), lerp(dst.b, src.b, alpha), 1}
}

func lerp(a, b, t float64) float64 { return a + (b-a)*t }

func clamp(t float64) float64 { return math.Max(0, math.Min(1, t)) }
