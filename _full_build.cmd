@cd /d "%~dp0"

call _prepare
call _pnpm_vite_build
call _optimize_graphics
call _package_electron
