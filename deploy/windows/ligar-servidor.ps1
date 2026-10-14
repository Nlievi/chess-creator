# Liga o servidor do Xadrez IA que roda no Ubuntu do WSL e mostra a URL pública.
# O WSL desliga sozinho quando nenhum processo dele está aberto no Windows (os serviços do systemd não contam).
# Por isso este script deixa um "sleep infinity" do WSL rodando escondido: enquanto ele existir, o servidor fica no ar.
$distro = 'Ubuntu-24.04'

$mantendo = Get-CimInstance Win32_Process -Filter "Name = 'wsl.exe'" |
  Where-Object { $_.CommandLine -match 'sleep infinity' }
if ($mantendo) {
  Write-Host "O Ubuntu já está sendo mantido ligado."
} else {
  Start-Process wsl.exe -ArgumentList "-d $distro --exec sleep infinity" -WindowStyle Hidden
  Write-Host "Ubuntu ligado em segundo plano (pode fechar as janelas do Ubuntu, ele continua rodando)."
  Start-Sleep -Seconds 5
}

Write-Host ""
Write-Host "Estado dos serviços:"
wsl.exe -d $distro -u root -- systemctl is-active xadrez xadrez-tunel ssh
Write-Host ""
wsl.exe -d $distro -u root -- bash /opt/xadrez-ia/deploy/tunel.sh
Write-Host "Para desligar o servidor de vez: wsl --shutdown"
