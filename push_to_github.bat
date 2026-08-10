@echo off
git init
git branch -M main
git remote remove origin 2>nul
git remote add origin https://github.com/frodriguezfrango/avicola-pro.git
git add .
git commit -m "Avicola Pro - Sincronizacion de Respaldo, Usuarios y Correccion de Movimientos"
git push -u origin main
