---
title:  Point to Site Connectivity in Azure
author: Khaled Hikmat
author_title: Software Engineer
author_url: https://github.com/khaledhikmat
author_image_url: https://avatars1.githubusercontent.com/u/3119726?s=400&u=090899e7b366dd702f9d0d5e483f20089010b25c&v=4
tags: [Azure]
---

This PowerShell script creates self-signed root and client certificates, export them and import what is needed:


```
# Assume you are on Windows 10
$myPassword = "some_password";
$certsPath = "C:\YourDir\Certificates"
$certNamePrefix = "YourNameP2S";
$date = Get-date "2040-01-01";

# Create a self-signed ROOT cert 
$rootCert = New-SelfSignedCertificate -Type Custom -KeySpec Signature -Subject "CN=$($certNamePrefix)Cert" -KeyExportPolicy Exportable -HashAlgorithm sha256 -KeyLength 2048 -CertStoreLocation "Cert:\CurrentUser\My" -KeyUsageProperty Sign -KeyUsage CertSign -NotAfter $date

# Export the cert to base64 so it can be uploaded to the Point-to-Site VPN connection: refer to https://docs.microsoft.com/en-us/azure/vpn-gateway/vpn-gateway-certificates-point-to-site
# Upload the .cer ending with '_Encoded'
Export-Certificate -Cert $rootCert -FilePath "$certsPath\$($certNamePrefix)Cert.cer" 
Start-Process -FilePath 'certutil.exe' -ArgumentList "-encode $certsPath\$($certNamePrefix)Cert.cer $certsPath\$($certNamePrefix)Cert_Encoded.cer" -WindowStyle Hidden

# NOTE: Download the VPN Client from Azure AFTER you upload the encoded certificate i.e. .cer file

# Generate a client certificate from the self-signed certificate
# NOTE: The self-siged root cert and the client cert must have the same subject!!!
$clientCert = New-SelfSignedCertificate -Type Custom -KeySpec Signature -Subject "CN=$($certNamePrefix)Cert" -KeyExportPolicy Exportable -HashAlgorithm sha256 -KeyLength 2048 -CertStoreLocation "Cert:\CurrentUser\My" -Signer $rootCert -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.2") -NotAfter $date

# Export the client certificate as PFX
Export-PfxCertificate -Cert $clientCert -ChainOption BuildChain -FilePath  "$certsPath\$($certNamePrefix)Cert.pfx" -Password $(ConvertTo-SecureString -String $myPassword -AsPlainText -Force)

# Import the PFX client cert into the user store
Import-PfxCertificate -CertStoreLocation Cert:\CurrentUser\my\ -FilePath "$certsPath\$($certNamePrefix)Cert.pfx" -Exportable -Password $(ConvertTo-SecureString -String $myPassword -AsPlainText -Force)
```
I hope it helps someone.
