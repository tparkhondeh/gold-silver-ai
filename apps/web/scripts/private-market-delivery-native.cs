// Fixed Windows-to-Linux operator delivery. No provider calls, retries, repair or activation.
using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using Microsoft.Win32.SafeHandles;

public static class PrivateMarketDeliveryNative {
  const string Source = @"C:\Users\pc\Desktop\project\gold silver\apps\web\.env.local";
  const string Commit = "59f7e513156671350bc2f89bb6f9d07dd80db6da";
  const string Release = "/home/wealthos_dev/.goldsilver-service/releases/" + Commit;
  const string Receipt = "{\"state\":\"received_only\",\"runtimeAttached\":false,\"quotaAuthorityVerified\":false}\n";
  const string Checked = "{\"state\":\"checked_only\",\"sourceMetadataSafe\":true,\"destinationAbsent\":true,\"configurationStored\":false,\"runtimeAttached\":false,\"quotaAuthorityVerified\":false}";
  const string Delivered = "{\"state\":\"delivered_only\",\"configurationStored\":true,\"postVerificationPassed\":true,\"runtimeAttached\":false,\"quotaAuthorityVerified\":false,\"accountAccessVerified\":false}";
  const string Failed = "{\"state\":\"blocked\",\"contentsWithheld\":true,\"destinationMayExist\":true,\"automaticRetryAllowed\":false,\"runtimeAttached\":false}";
  const int SourceLimit = 65536, PayloadLimit = 16384;
  static readonly UTF8Encoding Utf8 = new UTF8Encoding(false, true);
  static readonly string[] Names = { "NAVASAN_API_KEY", "NAVASAN_PLAN", "NAVASAN_VALUE_UNIT", "NAVASAN_REFRESH_SECONDS", "NAVASAN_KEY_ROTATION_CONFIRMED" };
  static IOException Denied() { return new IOException("Private provider delivery blocked; contents withheld; preserve any destination for review"); }

  [StructLayout(LayoutKind.Sequential)] struct Attributes { public int Length; public IntPtr Descriptor; public int Inherit; }
  [StructLayout(LayoutKind.Sequential)] struct Information {
    public uint Attributes;
    public System.Runtime.InteropServices.ComTypes.FILETIME Creation, Access, Write;
    public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
  }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern SafeFileHandle CreateFile(string path,uint access,uint share,ref Attributes attributes,uint disposition,uint flags,IntPtr template);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle file,out Information information);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern uint GetFinalPathNameByHandle(SafeFileHandle file,StringBuilder path,uint size,uint flags);
  [DllImport("kernel32.dll")] static extern uint GetFileType(SafeFileHandle file);
  [DllImport("advapi32.dll")] static extern uint GetSecurityInfo(SafeFileHandle file,uint type,uint flags,out IntPtr owner,out IntPtr group,out IntPtr dacl,out IntPtr sacl,out IntPtr descriptor);
  [DllImport("advapi32.dll")] static extern uint GetSecurityDescriptorLength(IntPtr descriptor);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr pointer);

  static RawSecurityDescriptor Security(SafeFileHandle handle) {
    IntPtr owner,group,dacl,sacl,descriptor;
    if(GetSecurityInfo(handle,1,5,out owner,out group,out dacl,out sacl,out descriptor)!=0) throw Denied();
    try {
      uint length=GetSecurityDescriptorLength(descriptor);
      if(length==0 || length>65536) throw Denied();
      byte[] bytes=new byte[length]; Marshal.Copy(descriptor,bytes,0,bytes.Length);
      return new RawSecurityDescriptor(bytes,0);
    } finally { if(descriptor!=IntPtr.Zero) LocalFree(descriptor); }
  }
  static void ValidateAcl(SafeFileHandle handle,string path,string sid,bool directory) {
    var acl=Security(handle);
    if(acl.Owner==null || acl.DiscretionaryAcl==null) throw Denied();
    const string system="S-1-5-18", admins="S-1-5-32-544";
    if(!directory) {
      if(acl.Owner.Value!=sid || (acl.ControlFlags & ControlFlags.DiscretionaryAclProtected)==0) throw Denied();
      bool ownerFound=false;
      foreach(GenericAce generic in acl.DiscretionaryAcl) {
        var ace=generic as CommonAce;
        if(ace==null || ace.IsCallback || ace.AceFlags!=AceFlags.None || ace.AceQualifier!=AceQualifier.AccessAllowed
          || (ace.SecurityIdentifier.Value!=sid && ace.SecurityIdentifier.Value!=system) || ace.AccessMask!=0x1F01FF) throw Denied();
        if(ace.SecurityIdentifier.Value==sid) { if(ownerFound) throw Denied(); ownerFound=true; }
      }
      if(!ownerFound) throw Denied();
    } else {
      bool servicingRoot=path.Equals(@"C:\",StringComparison.OrdinalIgnoreCase)
        && acl.Owner.Value=="S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464";
      if(acl.Owner.Value!=sid && acl.Owner.Value!=system && acl.Owner.Value!=admins && !servicingRoot) throw Denied();
      foreach(GenericAce generic in acl.DiscretionaryAcl) {
        var ace=generic as CommonAce;
        if(ace==null || ace.IsCallback) throw Denied();
        // Pinned GENERIC_READ handles deny namespace replacement; the separately
        // selected source identity also fences replacement before the pins exist.
        // Never allow foreign ACL/owner control or unknown/generic-all authority.
        if(ace.AceQualifier==AceQualifier.AccessAllowed && (ace.AceFlags & AceFlags.InheritOnly)==0
          && ace.SecurityIdentifier.Value!=sid && ace.SecurityIdentifier.Value!=system && ace.SecurityIdentifier.Value!=admins
          && (ace.AccessMask & ~unchecked((int)0xE01301FF))!=0) throw Denied();
      }
    }
  }
  static Information Inspect(SafeFileHandle handle,string path,string sid,bool directory) {
    Information info;
    if(handle.IsInvalid || GetFileType(handle)!=1 || !GetFileInformationByHandle(handle,out info)
      || (info.Attributes & 0x400)!=0 || ((info.Attributes & 0x10)!=0)!=directory) throw Denied();
    long size=((long)info.SizeHigh<<32)|info.SizeLow;
    if(!directory && (info.Links!=1 || size<1 || size>SourceLimit)) throw Denied();
    var actual=new StringBuilder(1024);
    uint length=GetFinalPathNameByHandle(handle,actual,1024,0);
    if(length==0 || length>=1024 || !actual.ToString().Equals(@"\\?\"+path,StringComparison.OrdinalIgnoreCase)) throw Denied();
    ValidateAcl(handle,path,sid,directory); return info;
  }
  static bool Same(Information a,Information b,bool directory) {
    return a.Volume==b.Volume && a.IndexHigh==b.IndexHigh && a.IndexLow==b.IndexLow
      && (directory || (a.SizeHigh==b.SizeHigh && a.SizeLow==b.SizeLow && a.Links==b.Links
        && a.Write.dwHighDateTime==b.Write.dwHighDateTime && a.Write.dwLowDateTime==b.Write.dwLowDateTime));
  }
  static string SourceIdentity(Information info) {
    return info.Volume.ToString("x8",CultureInfo.InvariantCulture)+":"
      +info.IndexHigh.ToString("x8",CultureInfo.InvariantCulture)+info.IndexLow.ToString("x8",CultureInfo.InvariantCulture)+":"
      +info.SizeHigh.ToString("x8",CultureInfo.InvariantCulture)+info.SizeLow.ToString("x8",CultureInfo.InvariantCulture)+":"
      +unchecked((uint)info.Write.dwHighDateTime).ToString("x8",CultureInfo.InvariantCulture)
      +unchecked((uint)info.Write.dwLowDateTime).ToString("x8",CultureInfo.InvariantCulture);
  }
  static void RequireExpectedIdentity(Information info,string expected) {
    if(SourceIdentity(info)!=expected) throw Denied();
  }
  sealed class SourcePin : IDisposable {
    sealed class Pin { public string Path; public SafeFileHandle Handle; public Information Info; public bool Directory; }
    readonly List<Pin> pins=new List<Pin>();
    readonly string sid=WindowsIdentity.GetCurrent().User.Value;
    readonly string expectedIdentity;
    FileStream stream;
    public SourcePin(string expected) {
      if(expected==null || !Regex.IsMatch(expected,@"\A[a-f0-9]{8}:[a-f0-9]{16}:[a-f0-9]{16}:[a-f0-9]{16}\z",RegexOptions.CultureInvariant)) throw Denied();
      expectedIdentity=expected;
      try {
        var ancestors=new List<string>();
        for(var next=new DirectoryInfo(Path.GetDirectoryName(Source));next!=null;next=next.Parent) ancestors.Insert(0,next.FullName);
        foreach(string path in ancestors) Add(path,true);
        var leaf=Add(Source,false);
        stream=new FileStream(leaf.Handle,FileAccess.Read);
        Recheck();
      } catch { Dispose(); throw Denied(); }
    }
    Pin Add(string path,bool directory) {
      var attributes=new Attributes { Length=Marshal.SizeOf(typeof(Attributes)), Inherit=0 };
      // GENERIC_READ is required even for directory metadata pins: attributes-only
      // handles do not enforce Windows sharing exclusion. Never enumerate contents.
      // Directory pins deny delete sharing; the source denies write AND delete.
      var handle=CreateFile(path,0x80020080u,directory?3u:1u,ref attributes,3,
        directory?0x02200000u:0x00200080u,IntPtr.Zero);
      if(handle.IsInvalid) { handle.Dispose(); throw Denied(); }
      var pin=new Pin { Path=path,Handle=handle,Directory=directory }; pins.Add(pin);
      pin.Info=Inspect(handle,path,sid,directory);
      if(!directory) RequireExpectedIdentity(pin.Info,expectedIdentity);
      return pin;
    }
    public void Recheck() {
      foreach(var pin in pins) {
        var info=Inspect(pin.Handle,pin.Path,sid,pin.Directory);
        if(!Same(pin.Info,info,pin.Directory)) throw Denied();
        if(!pin.Directory) RequireExpectedIdentity(info,expectedIdentity);
      }
    }
    public byte[] Read() {
      Recheck();
      byte[] buffer=new byte[SourceLimit+1];
      try {
        int length=0,n;
        while(length<buffer.Length && (n=stream.Read(buffer,length,buffer.Length-length))!=0) length+=n;
        if(length!=stream.Length || length<1 || length>SourceLimit) throw Denied();
        Recheck(); byte[] result=new byte[length]; Array.Copy(buffer,result,length); return result;
      } finally { Array.Clear(buffer,0,buffer.Length); }
    }
    public void Dispose() {
      bool failed=false;
      try { if(stream!=null) stream.Dispose(); } catch { failed=true; }
      for(int i=pins.Count-1;i>=0;i--) try { pins[i].Handle.Dispose(); } catch { failed=true; }
      if(failed) throw Denied();
    }
  }

  sealed class Settings { public string Key,Unit; public int Refresh; }
  static Settings Parse(string source) {
    if(source==null || Utf8.GetByteCount(source)>SourceLimit) throw Denied();
    if(source.StartsWith("\uFEFF",StringComparison.Ordinal)) source=source.Substring(1);
    var found=new Dictionary<string,string>(StringComparer.Ordinal);
    foreach(string line in source.Split(new[]{"\r\n","\n","\r"},StringSplitOptions.None)) {
      var match=Regex.Match(line,@"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$",RegexOptions.CultureInvariant);
      if(!match.Success) {
        if(Regex.IsMatch(line,@"^\s*(?:export\s+)?NAVASAN_",RegexOptions.CultureInvariant)) throw Denied();
        continue;
      }
      if(Array.IndexOf(Names,match.Groups[1].Value)<0) {
        if(match.Groups[1].Value.StartsWith("NAVASAN_",StringComparison.Ordinal)) throw Denied();
        continue;
      }
      string name=match.Groups[1].Value,value=match.Groups[2].Value;
      if(found.ContainsKey(name) || value.Length==0) throw Denied();
      if(value[0]=='\'' || value[0]=='\"') {
        char quote=value[0];
        if(value.Length<2 || value[value.Length-1]!=quote) throw Denied();
        value=value.Substring(1,value.Length-2);
        if(value.IndexOf(quote)>=0 || (quote=='\"' && value.IndexOf('\\')>=0)) throw Denied();
      } else if(Regex.IsMatch(value,@"[\s#'""\\]",RegexOptions.CultureInvariant)) throw Denied();
      found.Add(name,value);
    }
    foreach(string name in Names) if(!found.ContainsKey(name)) throw Denied();
    int refresh;
    if(found["NAVASAN_PLAN"]!="free" || found["NAVASAN_KEY_ROTATION_CONFIRMED"]!="true"
      || (found["NAVASAN_VALUE_UNIT"]!="TOMAN" && found["NAVASAN_VALUE_UNIT"]!="IRR")
      || !Regex.IsMatch(found["NAVASAN_API_KEY"],@"\A[\x21-\x7e]{1,4096}\z",RegexOptions.CultureInvariant)
      || !Regex.IsMatch(found["NAVASAN_REFRESH_SECONDS"],@"\A[1-9][0-9]*\z",RegexOptions.CultureInvariant)
      || !Int32.TryParse(found["NAVASAN_REFRESH_SECONDS"],NumberStyles.None,CultureInfo.InvariantCulture,out refresh)
      || refresh<24000 || refresh>31536000) throw Denied();
    return new Settings { Key=found["NAVASAN_API_KEY"],Unit=found["NAVASAN_VALUE_UNIT"],Refresh=refresh };
  }
  static string EscapeAscii(string value) { return value.Replace("\\","\\\\").Replace("\"","\\\""); }
  // Pure synthetic-test seam. No filesystem/network, raw source or parsed value in errors.
  public static byte[] BuildPayload(string source,string bindingHash) {
    try {
      if(bindingHash==null || !Regex.IsMatch(bindingHash,@"\A[a-f0-9]{64}\z",RegexOptions.CultureInvariant)) throw Denied();
      var config=Parse(source);
      // All variable fields are validated ASCII; only JSON quote/backslash escaping remains.
      string json="{\"version\":\"asha.private_market_config.v1\",\"provider\":\"navasan\",\"plan\":\"free\",\"origin\":\"https://goldsilver.wealthos.ir\",\"ownerBindingHash\":\""+bindingHash
        +"\",\"valueUnit\":\""+config.Unit+"\",\"refreshSeconds\":"+config.Refresh.ToString(CultureInfo.InvariantCulture)
        +",\"keyRotationConfirmed\":true,\"apiKey\":\""+EscapeAscii(config.Key)+"\"}";
      byte[] bytes=Utf8.GetBytes(json); if(bytes.Length>PayloadLimit) { Array.Clear(bytes,0,bytes.Length); throw Denied(); } return bytes;
    } catch { throw Denied(); }
  }
  public static string ValidatePreflight(string output) {
    var match=Regex.Match(output??"",@"\AASHA_MARKET_ABSENT_V1 ([a-f0-9]{64})\n\z",RegexOptions.CultureInvariant);
    if(!match.Success) throw Denied(); return match.Groups[1].Value;
  }
  public static void ValidateReceipt(string output) { if(output!=Receipt) throw Denied(); }
  public static void ValidatePostflight(string output,string bindingHash,string unit,int refresh) {
    if(output!="ASHA_MARKET_CONFIGURED_V1 "+bindingHash+" "+unit+" "+refresh.ToString(CultureInfo.InvariantCulture)+"\n") throw Denied();
  }
  static string ProbeSource(bool after) {
    return "try {\nconst root='"+Release+"';\n"
      +"const {execFileSync}=await import('node:child_process'); const git=(...args)=>execFileSync('/usr/bin/git',args,{cwd:root,env:{HOME:'/home/wealthos_dev',PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',GIT_OPTIONAL_LOCKS:'0'},encoding:'utf8',timeout:10000,maxBuffer:4096,stdio:['ignore','pipe','pipe']});\n"
      +"if(git('rev-parse','HEAD')!=='"+Commit+"\\n'||git('symbolic-ref','--short','HEAD')!=='codex/phase-2-decision-engine\\n'||git('status','--porcelain=v1','--untracked-files=all')!=='') throw Error();\n"
      +"const {readPrivateServerConfig,assertPrivateProcessEnvironment}=await import('file://'+root+'/apps/web/scripts/private-server-config.ts'); assertPrivateProcessEnvironment(process.env);\n"
      +"const c=await readPrivateServerConfig(); if(c.version!==2||c.authentication!=='passkey') throw Error();\n"
      +"const {inspectOwnerIdentityBinding,identityBindingHash}=await import('file://'+root+'/apps/web/auth/postgres-owner-identity-store.ts');\n"
      +"const binding=inspectOwnerIdentityBinding({origin:c.origin,issuer:c.origin,ownerSubject:c.ownerSubject,portfolioSubject:c.portfolioSubject});\n"
      +"const {readPrivateMarketConfig}=await import('file://'+root+'/apps/web/scripts/private-market-config.ts'); const p=await readPrivateMarketConfig(binding);\n"
      +(after ? "if(p.state!=='configured_only'||p.runtimeAttached!==false||p.quotaAuthorityVerified!==false||p.keyTransferVerified!==false) throw Error(); process.stdout.write('ASHA_MARKET_CONFIGURED_V1 '+identityBindingHash(binding)+' '+p.configuration.valueUnit+' '+p.configuration.refreshSeconds+'\\n');\n"
        : "if(p.state!=='disabled'||p.runtimeAttached!==false||p.quotaAuthorityVerified!==false||p.keyTransferVerified!==false) throw Error(); process.stdout.write('ASHA_MARKET_ABSENT_V1 '+identityBindingHash(binding)+'\\n');\n")
      +"} catch { process.stderr.write('Private provider verification failed; contents withheld.\\n'); process.exitCode=1; }\n";
  }
  static ProcessStartInfo SshStartInfo(bool receiver) {
    string command=receiver ? Release+"/apps/web/scripts/receive-private-market-config.mjs --receive-approved-key" : "--input-type=module";
    var start=new ProcessStartInfo {
      FileName=@"C:\Windows\System32\OpenSSH\ssh.exe",
      Arguments=@"-F NUL -T -p 2490 -i C:\Users\pc\.ssh\wealthos_dev -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=C:\Users\pc\.ssh\known_hosts -o GlobalKnownHostsFile=NUL -o UpdateHostKeys=no -o IdentitiesOnly=yes -o IdentityAgent=none -o ForwardAgent=no -o ClearAllForwardings=yes -o RequestTTY=no -o PermitLocalCommand=no -o ControlMaster=no -o ControlPath=none -o LogLevel=ERROR -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 wealthos_dev@62.204.61.18 /usr/bin/env -i HOME=/home/wealthos_dev PATH=/usr/local/bin:/usr/bin:/bin LANG=C LC_ALL=C /usr/local/bin/node --experimental-strip-types "+command,
      UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true
    };
    start.EnvironmentVariables.Clear();
    start.EnvironmentVariables["SystemRoot"]=@"C:\Windows";
    start.EnvironmentVariables["PATH"]=@"C:\Windows\System32";
    start.EnvironmentVariables["USERPROFILE"]=@"C:\Users\pc";
    // Windows OpenSSH fails even at -V without this OS path; never inherit env.
    start.EnvironmentVariables["ProgramData"]=@"C:\ProgramData";
    return start;
  }
  static string Ssh(byte[] input,bool receiver) {
    var start=SshStartInfo(receiver);
    using(var process=new Process { StartInfo=start }) {
      byte[] output=new byte[1025];
      Task[] workers=null;
      try {
        if(!process.Start()) throw Denied();
        int count=0;
        var read=Task.Run(async delegate {
          while(count<output.Length) { int n=await process.StandardOutput.BaseStream.ReadAsync(output,count,output.Length-count); if(n==0) break; count+=n; }
          if(count>1024) throw Denied();
        });
        var errors=Task.Run(async delegate {
          byte[] discard=new byte[1024]; int total=0;
          try { int n; while((n=await process.StandardError.BaseStream.ReadAsync(discard,0,discard.Length))!=0) {
            total+=n; Array.Clear(discard,0,discard.Length); if(total>8192) throw Denied();
          } } finally { Array.Clear(discard,0,discard.Length); }
        });
        var write=Task.Run(async delegate { await process.StandardInput.BaseStream.WriteAsync(input,0,input.Length); process.StandardInput.Close(); });
        workers=new Task[]{read,errors,write};
        if(!Task.WaitAll(workers,45000) || !process.WaitForExit(2000) || process.ExitCode!=0) throw Denied();
        return Utf8.GetString(output,0,count);
      } catch { throw Denied(); }
      finally {
        try { if(!process.HasExited) { process.Kill(); process.WaitForExit(2000); } } catch { }
        // Close pipes before wiping buffers even on timeout/oversized child output.
        try { process.StandardInput.Close(); } catch { }
        try { process.StandardOutput.Close(); } catch { }
        try { process.StandardError.Close(); } catch { }
        try { if(workers!=null) Task.WaitAll(workers,2000); } catch { }
        Array.Clear(output,0,output.Length);
      }
    }
  }
  static string Probe(bool after) {
    byte[] bytes=Utf8.GetBytes(ProbeSource(after));
    try { return Ssh(bytes,false); } finally { Array.Clear(bytes,0,bytes.Length); }
  }
  // Check never reads source contents. Deliver must be explicitly owner-authorized.
  // Invoke only from a trusted launcher that hashes bounded, retained-handle C#
  // bytes against an independently reviewed literal before compiling in memory.
  // expectedSourceIdentity is independently selected metadata, never auto-captured.
  // Fixed probes do not prove SSH account ownership, account-wide quota or retirement.
  // The OS owner/admin remains trusted; managed strings cannot guarantee erasure.
  // Fixed ssh.exe, private identity and known_hosts remain trusted operator inputs;
  // their integrity/host fingerprint must be checked separately before delivery.
  public static string Execute(string mode,string expectedSourceIdentity) {
    byte[] source=null,payload=null;
    try {
      if(Environment.OSVersion.Platform!=PlatformID.Win32NT || (mode!="Check" && mode!="Deliver")) throw Denied();
      using(var pin=new SourcePin(expectedSourceIdentity)) {
        string bindingHash=ValidatePreflight(Probe(false));
        pin.Recheck();
        if(mode=="Check") return Checked;
        source=pin.Read();
        string text=Utf8.GetString(source);
        var settings=Parse(text);
        payload=BuildPayload(text,bindingHash);
        pin.Recheck();
        ValidateReceipt(Ssh(payload,true));
        pin.Recheck();
        ValidatePostflight(Probe(true),bindingHash,settings.Unit,settings.Refresh);
        pin.Recheck();
      }
      return Delivered;
    } catch { return Failed; }
    finally {
      if(source!=null) Array.Clear(source,0,source.Length);
      if(payload!=null) Array.Clear(payload,0,payload.Length);
    }
  }
}
