import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { PlusCircle, FileText, Eye, Ban, CloudUpload, CloudDownload, LogOut, Loader2, ShieldX } from "lucide-react"

const isLab = import.meta.env.VITE_APP_TARGET === 'lab';

type AuthState = 'checking' | 'unauthorized' | 'authorized';

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

  useEffect(() => {
    // 1. Check cached auth first (avoids re-prompting on every open)
    chrome.storage.local.get(['authUser'], (result: { authUser?: AuthUser }) => {
      if (result.authUser && result.authUser.allowed) {
        setAuthUser(result.authUser)
        setAuthState('authorized')
        runDomainCheck()
      } else {
        // 2. No valid cache — trigger interactive Google sign-in + allowlist check
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

  const handleSignOut = () => {
    chrome.runtime.sendMessage({ action: "SIGN_OUT" }, () => {
      setAuthState('checking')
      setAuthUser(null)
      // Re-trigger auth so user can pick a different account
      chrome.runtime.sendMessage({ action: "CHECK_AUTH" }, (response) => {
        if (response?.allowed) {
          setAuthUser({ email: response.email, name: response.name, picture: response.picture, allowed: true })
          setAuthState('authorized')
          runDomainCheck()
        } else {
          setAuthUser(response ? { email: response.email, name: response.name, picture: response.picture, allowed: false } : null)
          setAuthState('unauthorized')
        }
      })
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
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-1 gap-2 text-xs"
          onClick={handleSignOut}
        >
          <LogOut className="h-3 w-3" />
          Sign in with a different account
        </Button>
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
