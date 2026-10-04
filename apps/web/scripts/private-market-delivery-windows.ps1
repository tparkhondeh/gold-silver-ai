param([string]$Mode = 'Check', [string]$ExpectedSourceIdentity)
# Deliberately inert: this checkout's ordinary files are shared-writeable.
# An external trusted NoProfile launcher must hold/read bounded C# bytes, compare
# their SHA256 with an independently reviewed literal, compile only those bytes
# in memory, and supply independently selected source metadata to Execute.
# Do not add Add-Type -Path, automatic source selection or a fallback here.
[Console]::Out.WriteLine('{"state":"blocked","verifiedLoaderRequired":true,"contentsWithheld":true,"configurationStored":false,"runtimeAttached":false}')
exit 1
