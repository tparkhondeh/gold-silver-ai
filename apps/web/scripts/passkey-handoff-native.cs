// Windows-only native creation and handle verification. No secret logging.
using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Threading.Tasks;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using Microsoft.Win32.SafeHandles;

public static class PasskeyHandoffNative {
  [StructLayout(LayoutKind.Sequential)] struct Attributes { public int Length; public IntPtr Descriptor; public int Inherit; }
  [StructLayout(LayoutKind.Sequential)] struct Information {
    public uint Attributes; public System.Runtime.InteropServices.ComTypes.FILETIME Creation, Access, Write;
    public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
  }
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string s, uint revision, out IntPtr descriptor, out uint size);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern SafeFileHandle CreateFile(string path, uint access, uint share, ref Attributes attributes, uint disposition, uint flags, IntPtr template);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle file, out Information information);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern uint GetFinalPathNameByHandle(SafeFileHandle file, StringBuilder path, uint size, uint flags);
  [DllImport("advapi32.dll")] static extern uint GetSecurityInfo(SafeFileHandle file, uint type, uint flags, out IntPtr owner, out IntPtr group, out IntPtr dacl, out IntPtr sacl, out IntPtr descriptor);
  [DllImport("advapi32.dll")] static extern uint GetSecurityDescriptorLength(IntPtr descriptor);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr pointer);

  public static FileStream CreatePrivate(string path, string sid) {
    IntPtr descriptor = IntPtr.Zero; uint size;
    try {
      if (!ConvertStringSecurityDescriptorToSecurityDescriptor("O:"+sid+"D:P(A;;FA;;;"+sid+")(A;;FA;;;SY)",1,out descriptor,out size)) throw new IOException();
      var attributes = new Attributes { Length=Marshal.SizeOf(typeof(Attributes)), Descriptor=descriptor, Inherit=0 };
      // CREATE_NEW + no sharing. Attach protected owner/SYSTEM DACL atomically.
      var handle = CreateFile(path,0xC0020000,0,ref attributes,1,0x00200080,IntPtr.Zero);
      if (handle.IsInvalid) { handle.Dispose(); throw new IOException(); }
      try { Verify(handle,path,sid,0); return new FileStream(handle,FileAccess.ReadWrite); }
      catch { handle.Dispose(); throw; }
    } finally { if(descriptor!=IntPtr.Zero) LocalFree(descriptor); }
  }
  public static void Inspect(string path, string sid, long expectedSize) {
    var attributes = new Attributes { Length=Marshal.SizeOf(typeof(Attributes)) };
    using(var handle=CreateFile(path,0x00020080,7,ref attributes,3,0x00200080,IntPtr.Zero)) {
      if(handle.IsInvalid) throw new IOException(); Verify(handle,path,sid,expectedSize);
    }
  }
  public static void Verify(SafeFileHandle handle,string path,string sid,long expectedSize) {
    Information info;
    if(!GetFileInformationByHandle(handle,out info) || (info.Attributes & (0x10|0x400))!=0 || info.Links!=1) throw new IOException();
    long size=((long)info.SizeHigh<<32)|info.SizeLow;
    if(expectedSize>=0 && size!=expectedSize || expectedSize<0 && size>512) throw new IOException();
    var final=new StringBuilder(512); uint length=GetFinalPathNameByHandle(handle,final,512,0);
    if(length==0 || length>=512 || !String.Equals(final.ToString(),"\\\\?\\"+path,StringComparison.OrdinalIgnoreCase)) throw new IOException();
    IntPtr owner,group,dacl,sacl,descriptor;
    if(GetSecurityInfo(handle,1,5,out owner,out group,out dacl,out sacl,out descriptor)!=0) throw new IOException();
    try {
      uint lengthBytes=GetSecurityDescriptorLength(descriptor);
      if(lengthBytes==0 || lengthBytes>16384) throw new IOException();
      byte[] bytes=new byte[lengthBytes]; Marshal.Copy(descriptor,bytes,0,bytes.Length);
      var security=new RawSecurityDescriptor(bytes,0);
      if(security.Owner.Value!=sid || (security.ControlFlags & ControlFlags.DiscretionaryAclProtected)==0 || security.DiscretionaryAcl==null || security.DiscretionaryAcl.Count!=2) throw new IOException();
      bool foundOwner=false,foundSystem=false;
      foreach(GenericAce generic in security.DiscretionaryAcl) {
        var ace=generic as CommonAce;
        if(ace==null || ace.IsCallback || ace.AceQualifier!=AceQualifier.AccessAllowed || ace.AceFlags!=AceFlags.None || ace.AccessMask!=0x1F01FF) throw new IOException();
        if(ace.SecurityIdentifier.Value==sid && !foundOwner) foundOwner=true;
        else if(ace.SecurityIdentifier.Value=="S-1-5-18" && !foundSystem) foundSystem=true;
        else throw new IOException();
      }
      if(!foundOwner || !foundSystem) throw new IOException();
    } finally { LocalFree(descriptor); }
  }
  public static byte[] Transfer(string source) {
    var start=new ProcessStartInfo {
      FileName=@"C:\Windows\System32\OpenSSH\ssh.exe",
      Arguments=@"-F NUL -T -p 2490 -i C:\Users\pc\.ssh\wealthos_dev -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=C:\Users\pc\.ssh\known_hosts -o GlobalKnownHostsFile=NUL -o IdentitiesOnly=yes -o IdentityAgent=none -o ForwardAgent=no -o ClearAllForwardings=yes -o RequestTTY=no -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 wealthos_dev@62.204.61.18 /usr/bin/env -i HOME=/home/wealthos_dev PATH=/usr/local/bin:/usr/bin:/bin LANG=C LC_ALL=C /usr/local/bin/node --input-type=module",
      UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true
    };
    using(var process=new Process { StartInfo=start }) {
      byte[] output=new byte[69];
      try {
        if(!process.Start()) throw new IOException();
        var read=Task.Run(async delegate {
          int total=0;
          while(total<output.Length) { int n=await process.StandardOutput.BaseStream.ReadAsync(output,total,output.Length-total); if(n==0) break; total+=n; }
          if(total!=68) throw new IOException();
        });
        var errors=Task.Run(async delegate {
          byte[] discard=new byte[256]; int total=0,n;
          while((n=await process.StandardError.BaseStream.ReadAsync(discard,0,discard.Length))!=0) { total+=n; Array.Clear(discard,0,discard.Length); if(total>8192) throw new IOException(); }
        });
        var write=Task.Run(async delegate { await process.StandardInput.WriteAsync(source); process.StandardInput.Close(); });
        if(!Task.WaitAll(new Task[]{read,errors,write},65000) || !process.WaitForExit(2000) || process.ExitCode!=0) throw new IOException();
        byte[] frame=new byte[68]; Array.Copy(output,frame,68); return frame;
      } finally {
        Array.Clear(output,0,output.Length);
        try { if(!process.HasExited) process.Kill(); } catch { }
      }
    }
  }
}
