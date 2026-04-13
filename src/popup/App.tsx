import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { PlusCircle, FileText, Eye, Ban, CloudUpload, CloudDownload, LogOut, Loader2, ShieldX, Key, Settings } from "lucide-react"

const isLab = import.meta.env.VITE_APP_TARGET === 'lab';

type AuthState = 'setup' | 'checking' | 'unauthorized' | 'authorized';

interface AuthUser {
  email: string;
  name: string;
  picture?: string;
  allowed: boolean;
}

export function App() {
  const [authState, setAuthState] = useState<AuthState>('checking')
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [statusMsg, setStatusMsg] = useState("")
  const [statusColor, setStatusColor] = useState("text-muted-foreground")
  const [isDisabled, setIsDisabled] = useState(false)
  const [clientIdInput, setClientIdInput] = useState("")
  const [folderIdInput, setFolderIdInput] = useState("")
  const [showBackupWarning, setShowBackupWarning] = useState(false)

  const checkAuth = () => {
    setAuthState('checking')
    chrome.storage.local.get(['clientId', 'folderId', 'authUser'], (result: any) => {
      if (!result.clientId || !result.folderId) {
        setAuthState('setup')
        return
      }

      if (result.authUser && result.authUser.allowed) {
        setAuthUser(result.authUser)
        setAuthState('authorized')
        runDomainCheck()
      } else {
        chrome.runtime.sendMessage({ action: "CHECK_AUTH" }, (response) => {
          if (chrome.runtime.lastError || !response?.success) {
            setAuthState('unauthorized')
            setAuthUser(null)
            return
          }
          const user: AuthUser = {
            email: response.email,
            name: response.name,
            picture: response.picture,
            allowed: response.allowed
          }
          setAuthUser(user)
          if (response.allowed) {
            setAuthState('authorized')
            runDomainCheck()
          } else {
            setAuthState('unauthorized')
          }
        })
      }
    })
  }

  useEffect(() => {
    checkAuth()
  }, [])

  const runDomainCheck = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url) {
        if (tabs[0].url.startsWith('chrome://') || tabs[0].url.startsWith('chrome-extension://')) {
          disableApp("Not available on Chrome pages.")
          return
        }
        const url = new URL(tabs[0].url)
        if (!url.hostname.endsWith('lablabee.com') && url.hostname !== 'lablabee.com') {
          disableApp("Active only on LabLabee domains.")
        }
      }
    })
  }

  const disableApp = (message: string) => {
    setStatusMsg(message)
    setStatusColor("text-destructive")
    setIsDisabled(true)
  }

  const handleSaveConfig = () => {
    if (!clientIdInput.trim() || !folderIdInput.trim()) return;
    
    let parsedFolderId = folderIdInput.trim();
    // Try to extract ID if they pasted a full Google Drive URL
    if (parsedFolderId.includes('drive.google.com/drive/folders/')) {
        parsedFolderId = parsedFolderId.split('folders/')[1].split('?')[0].split('/')[0];
    } else if (parsedFolderId.includes('id=')) {
        const match = parsedFolderId.match(/[?&]id=([^&]+)/);
        if (match) parsedFolderId = match[1];
    }

    chrome.storage.local.set({ 
      clientId: clientIdInput.trim(),
      folderId: parsedFolderId 
    }, () => {
      checkAuth()
    })
  }

  const handleSignOut = () => {
    chrome.runtime.sendMessage({ action: "SIGN_OUT" }, () => {
      setAuthState('checking')
      setAuthUser(null)
      checkAuth()
    })
  }

  const handleResetConfig = () => {
    chrome.storage.local.remove(['clientId', 'folderId'], () => {
      handleSignOut()
    })
  }

  const sendToPage = (actionName: string) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: actionName }, () => {
          if (chrome.runtime.lastError) {
            setStatusMsg("Error: Refresh the page.")
            setStatusColor("text-destructive")
          } else {
            window.close()
          }
        })
      }
    })
  }

  const sendToCloud = (actionName: string, loadingText: string) => {
    setStatusMsg(loadingText)
    setStatusColor("text-muted-foreground")
    setIsDisabled(true)
    chrome.runtime.sendMessage({ action: actionName }, (response) => {
      setIsDisabled(false)
      if (response?.success) {
        setStatusMsg("Success! ✅")
        setStatusColor("text-green-600")
        setTimeout(() => window.close(), 1500)
      } else {
        setStatusMsg("Sync Failed ❌")
        setStatusColor("text-destructive")
      }
    })
  }

  const bg = isLab ? "bg-[#0f172a]" : "bg-neutral-900"

  // ── Setup state ──────────────────────────────────────────────────────────────
  if (authState === 'setup') {
    const redirectUri = typeof chrome !== 'undefined' && chrome.identity ? chrome.identity.getRedirectURL() : "";
    return (
      <div className={`w-[240px] p-4 flex flex-col gap-3 font-sans text-white ${bg}`}>
        <div className="flex items-center gap-2 text-blue-400 mb-1">
          <Key className="h-5 w-5 shrink-0" />
          <span className="font-semibold text-sm">App Configuration</span>
        </div>
        <p className="text-[11px] text-slate-300 leading-snug">
          Please enter a Web Application Google OAuth Client ID to connect to Google Drive.
        </p>
        <div className="bg-blue-900/40 p-2 rounded border border-blue-500/30">
          <p className="text-[10px] text-blue-200 mb-1 leading-tight">Must add this exact URL to "Authorized redirect URIs" in GCP:</p>
          <code className="text-[9px] break-all select-all text-white bg-black/50 p-1 rounded block font-mono">
            {redirectUri}
          </code>
        </div>
        <input 
          type="text" 
          value={clientIdInput}
          onChange={(e) => setClientIdInput(e.target.value)}
          placeholder="Web App Client ID..."
          className="w-full text-xs p-2 bg-black/30 border border-white/20 rounded text-white focus:outline-none focus:border-blue-400"
        />
        <input 
          type="text" 
          value={folderIdInput}
          onChange={(e) => setFolderIdInput(e.target.value)}
          placeholder="Google Drive Shared Folder ID..."
          className="w-full text-xs p-2 bg-black/30 border border-white/20 rounded text-white focus:outline-none focus:border-blue-400"
        />
        <Button onClick={handleSaveConfig} className="w-full h-8 text-xs font-bold mt-1" variant="default">
          Save Configuration
        </Button>
      </div>
    )
  }

  if (showBackupWarning) {
    return (
      <div className={`w-[240px] p-4 flex flex-col gap-3 font-sans text-white ${bg}`}>
        <div className="flex items-center gap-2 text-yellow-500 mb-1">
          <ShieldX className="h-5 w-5 shrink-0" />
          <span className="font-semibold text-sm">Caution</span>
        </div>
        <p className="text-[11px] text-slate-300 leading-snug">
          Due to the app not having a backend, concurrent backup requests may cause some issues.
          <br/><br/>
          Please communicate to the lab owner or the tester before backing up!
        </p>
        <div className="flex gap-2 mt-2">
          <Button onClick={() => setShowBackupWarning(false)} className="flex-1 h-8 text-xs font-bold" variant="secondary">
            Cancel
          </Button>
          <Button onClick={() => { setShowBackupWarning(false); sendToCloud("BACKUP_TO_CLOUD", "Backing up to Drive..."); }} className="flex-1 h-8 text-xs font-bold bg-yellow-600 hover:bg-yellow-700 text-white border-transparent">
            Proceed
          </Button>
        </div>
      </div>
    )
  }

  // ── Checking state ───────────────────────────────────────────────────────────
  if (authState === 'checking') {
    return (
      <div className={`w-[240px] p-6 flex flex-col items-center gap-3 font-sans text-white ${bg}`}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Verifying access…</p>
      </div>
    )
  }

  // ── Unauthorized state ───────────────────────────────────────────────────────
  if (authState === 'unauthorized') {
    return (
      <div className={`w-[240px] p-4 flex flex-col items-center gap-3 font-sans text-white ${bg}`}>
        <ShieldX className="h-8 w-8 text-destructive mt-2" />
        <p className="text-sm font-semibold text-destructive text-center">Access Denied</p>
        {authUser?.email && (
          <p className="text-[11px] text-muted-foreground text-center break-all">
            <span className="font-medium text-white/70">{authUser.email}</span>
            <br />is not authorised to use this extension.
          </p>
        )}
        <div className="flex flex-col gap-1 w-full mt-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 text-xs"
            onClick={checkAuth}
          >
            <LogOut className="h-3 w-3" />
            Retry Login
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full gap-2 text-[10px] text-muted-foreground hover:text-white"
            onClick={handleResetConfig}
          >
            <Settings className="h-3 w-3" />
            Reset Client ID Config
          </Button>
        </div>
      </div>
    )
  }

  // ── Authorized state ─────────────────────────────────────────────────────────
  return (
    <div className={`w-[240px] p-3 space-y-2 font-sans text-white ${bg}`}>

      {/* User identity bar */}
      <div className="flex items-center gap-2 pb-2 border-b border-white/10">
        {authUser?.picture
          ? <img src={authUser.picture} alt="" className="w-6 h-6 rounded-full shrink-0" />
          : <div className="w-6 h-6 rounded-full bg-white/20 shrink-0 flex items-center justify-center text-[10px] font-bold">
              {authUser?.name?.[0]?.toUpperCase() ?? '?'}
            </div>
        }
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium truncate">{authUser?.name}</p>
          <p className="text-[10px] text-muted-foreground truncate">{authUser?.email}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-white"
          title="Reset Client ID Config"
          onClick={handleResetConfig}
        >
          <Settings className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
          title="Sign out"
          onClick={handleSignOut}
        >
          <LogOut className="h-3 w-3" />
        </Button>
      </div>

      {!isLab && (
        <Button
          variant="default"
          className="w-full justify-start gap-2 bg-red-600 hover:bg-red-700 text-white"
          onClick={() => sendToPage("START_ADDING_ISSUE")}
          disabled={isDisabled}
        >
          <PlusCircle className="h-4 w-4" />
          Log Issue
        </Button>
      )}

      {isLab && (
        <div className="text-[11px] text-slate-400 italic px-1 py-1 border border-dashed border-slate-600 rounded">
          💡 To fix an issue, view issues on the page and use the resolution panel on each card.
        </div>
      )}

      <Button
        variant="default"
        className="w-full justify-start gap-2 bg-blue-600 hover:bg-blue-700 text-white"
        onClick={() => sendToPage("START_ADDING_NOTE")}
        disabled={isDisabled}
      >
        <FileText className="h-4 w-4" />
        Take Note
      </Button>

      <div className="h-[1px] bg-border my-2" />

      <Button
        variant="secondary"
        className="w-full justify-start gap-2"
        onClick={() => sendToPage("SHOW_SUMMARY_ISSUE")}
        disabled={isDisabled}
      >
        <Eye className="h-4 w-4 text-yellow-600" />
        View Issues on Page
      </Button>

      <Button
        variant="secondary"
        className="w-full justify-start gap-2"
        onClick={() => sendToPage("SHOW_SUMMARY_NOTE")}
        disabled={isDisabled}
      >
        <Eye className="h-4 w-4 text-green-600" />
        View Notes on Page
      </Button>

      <Button
        variant="destructive"
        className="w-full justify-start gap-2"
        onClick={() => sendToPage("STOP_APP")}
        disabled={isDisabled}
      >
        <Ban className="h-4 w-4" />
        Stop / Hide App
      </Button>

      <div className="h-[1px] bg-border my-2" />

      <Button
        variant="outline"
        className="w-full justify-start gap-2"
        onClick={() => sendToCloud("BACKUP_TO_CLOUD", "Backing up to Drive...")}
      >
        <CloudUpload className="h-4 w-4 text-yellow-600" />
        Backup to Drive
      </Button>

      <Button
        variant="outline"
        className="w-full justify-start gap-2"
        onClick={() => sendToCloud("RESTORE_FROM_CLOUD", "Downloading from Drive...")}
      >
        <CloudDownload className="h-4 w-4 text-blue-600" />
        Sync from Drive
      </Button>

      <div className={`text-center text-xs font-medium h-4 mt-2 ${statusColor}`}>
        {statusMsg}
      </div>
    </div>
  )
}
