@echo off
"C:\Users\Agustin\AppData\Local\Programs\Git\cmd\git.exe" init
"C:\Users\Agustin\AppData\Local\Programs\Git\cmd\git.exe" branch -M main
"C:\Users\Agustin\AppData\Local\Programs\Git\cmd\git.exe" remote remove origin 2>nul
"C:\Users\Agustin\AppData\Local\Programs\Git\cmd\git.exe" remote add origin https://github.com/frodriguezfrango/avicola-pro.git
"C:\Users\Agustin\AppData\Local\Programs\Git\cmd\git.exe" add .
"C:\Users\Agustin\AppData\Local\Programs\Git\cmd\git.exe" commit -m "Avicola Pro v40.5 Multiusuario Listo para la Nube"
"C:\Users\Agustin\AppData\Local\Programs\Git\cmd\git.exe" push -u origin main
