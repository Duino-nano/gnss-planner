# Creates a project-local CA and server certificate. Does not install trust or alter firewall rules.
param([string[]]$IpAddresses)
$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
$certPath = Join-Path $projectPath 'certs'
if (Test-Path -LiteralPath (Join-Path $certPath 'local.pfx')) { throw 'Certificates already exist. Keep them to preserve device trust. See README.md for renewal.' }
if (-not $IpAddresses) {
    $IpAddresses = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -ExpandProperty IPAddress)
}
New-Item -ItemType Directory -Path $certPath -Force | Out-Null
$hash = [System.Security.Cryptography.HashAlgorithmName]::SHA256
$padding = [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
$rootKey = [System.Security.Cryptography.RSACng]::new(2048)
$rootRequest = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=GNSS FIELD Local CA', $rootKey, $hash, $padding)
$rootRequest.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($true, $true, 0, $true))
$rootRequest.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new([System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyCertSign, $true))
$root = $rootRequest.CreateSelfSigned([DateTimeOffset]::Now.AddDays(-1), [DateTimeOffset]::Now.AddDays(365))
$leafKey = [System.Security.Cryptography.RSACng]::new(2048)
$leafRequest = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=GNSS FIELD localhost', $leafKey, $hash, $padding)
$san = [System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
$san.AddDnsName('localhost')
$san.AddDnsName($env:COMPUTERNAME)
$san.AddIpAddress([System.Net.IPAddress]::Parse('127.0.0.1'))
foreach ($address in $IpAddresses) { $san.AddIpAddress([System.Net.IPAddress]::Parse($address)) }
$leafRequest.CertificateExtensions.Add($san.Build())
$leafRequest.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false, $false, 0, $true))
$oids = [System.Security.Cryptography.OidCollection]::new()
[void]$oids.Add([System.Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.1'))
$leafRequest.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($oids, $false))
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$serial = New-Object byte[] 16
$rng.GetBytes($serial)
$leafPublic = $leafRequest.Create($root, [DateTimeOffset]::Now.AddHours(-1), [DateTimeOffset]::Now.AddDays(90), $serial)
$leaf = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::CopyWithPrivateKey($leafPublic, $leafKey)
$passwordBytes = New-Object byte[] 32
$rng.GetBytes($passwordBytes)
$password = [Convert]::ToBase64String($passwordBytes)
[IO.File]::WriteAllBytes((Join-Path $certPath 'local.pfx'), $leaf.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $password))
[IO.File]::WriteAllBytes((Join-Path $certPath 'local-ca.cer'), $root.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert))
[IO.File]::WriteAllText((Join-Path $certPath 'password.txt'), $password)
[IO.File]::WriteAllText((Join-Path $certPath 'addresses.txt'), ($IpAddresses -join "`n"))
$leaf.Dispose(); $leafPublic.Dispose(); $root.Dispose(); $rootKey.Dispose(); $leafKey.Dispose(); $rng.Dispose()
Write-Host "Created certificates in $certPath"
Write-Host 'Transfer only local-ca.cer to your phone and explicitly trust it. Never share local.pfx or password.txt.'
Write-Host 'No certificate was installed into the Windows trust store.'
foreach ($address in $IpAddresses) { Write-Host "Phone URL: https://${address}:3443" }
