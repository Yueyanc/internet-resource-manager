package db

import (
	"embed"
	"io/fs"
)

//go:embed migrations/*.sql
var migrations embed.FS

func Migrations() fs.FS {
	sub, err := fs.Sub(migrations, "migrations")
	if err != nil {
		panic(err)
	}
	return sub
}
