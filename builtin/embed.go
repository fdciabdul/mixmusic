// Package builtin holds the add-ons MixMusic ships with, laid out as the
// add-ons folder of the user: themes/<id>/theme.json and its files.
package builtin

import "embed"

// FS holds the built-in add-ons.
//
//go:embed themes
var FS embed.FS
