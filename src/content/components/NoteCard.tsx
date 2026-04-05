import React, { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { X, ChevronDown, ChevronUp, CheckCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const isLab = import.meta.env.VITE_APP_TARGET === 'lab';

const LAB_RESOLUTION_TYPES: Record<string, string> = {
  "Pending": "#94a3b8",
  "Issue Fixed": "#4caf50",
  "Additional Info Required": "#ffeb3b",
  "No issue here": "#9e9e9e"
};

export function NoteCard({
  hash,
  contentHtml,
  noteType,
  typeColor,
  contextHtml,
  screenshotHtml,
  labComment: initialLabComment,
  labFixType: initialLabFixType,
  author,
  lastModifiedBy,
  onDelete,
  onHeightChange
}: any) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isManuallyExpanded, setIsManuallyExpanded] = useState(false)
  const [isOverlayActive, setIsOverlayActive] = useState(false)
  const [isTruncatable, setIsTruncatable] = useState(false)
  // Lab-specific: collapse the whole card body to just the header.
  // Defaults to collapsed in lab mode so all issue cards start as compact headers.
  const [isCardCollapsed, setIsCardCollapsed] = useState(isLab && noteType !== "Note")

  // Lab resolution state
  const [labFixType, setLabFixType] = useState<string>(initialLabFixType || "Pending")
  const [labComment, setLabComment] = useState<string>(initialLabComment || "")
  const [labSaved, setLabSaved] = useState(false)

  const contentRef = useRef<HTMLDivElement>(null)

  const isIssue = noteType !== "Note"

  useEffect(() => {
    if (contentRef.current && contentRef.current.scrollHeight > 100) {
      if (!isManuallyExpanded) setIsCollapsed(true)
      setIsTruncatable(true)
    }
  }, [contentHtml, screenshotHtml])

  useEffect(() => { onHeightChange() }, [isCollapsed, labSaved, isCardCollapsed])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOverlayActive(false)
    }
    if (isOverlayActive) window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isOverlayActive])

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (window.confirm("Delete this note?")) onDelete(hash)
  }

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed)
    setIsManuallyExpanded(true)
  }

  const handleLabSave = () => {
    if (!labComment.trim()) return
    chrome.runtime.sendMessage({
      action: "SAVE_NOTE",
      payload: {
        hash,
        content: contentHtml,
        url: window.location.href,
        timestamp: Date.now(),
        type: noteType,
        labComment,
        labFixType,
        taskContext: null
      }
    }, (response) => {
      if (response && response.success) {
        setLabSaved(true)
        setTimeout(() => setLabSaved(false), 2000)
        onHeightChange()
      }
    })
  }

  const resolutionColor = LAB_RESOLUTION_TYPES[labFixType] || "#9e9e9e"

  return (
    <>
      <Card
        className={cn(
          "w-[250px] shadow-lg flex flex-col relative",
          "border-l-4 group",
          "transition-all duration-300 ease-out",
          "hover:shadow-xl hover:-translate-y-0.5",
          // Animate in when mounted
          "animate-in fade-in slide-in-from-right-2 duration-300",
          isLab
            ? "bg-[#0f172a] text-white border-y-[#1e293b] border-r-[#1e293b]"
            : "bg-[#1a1a1a] text-white border-y-[#333] border-r-[#333]"
        )}
        style={{ borderLeftColor: typeColor }}
      >
        {!isLab && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-1 right-1 h-6 w-6 text-muted-foreground hover:bg-destructive/20 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110 z-10"
            onClick={handleDelete}
          >
            <X className="h-3 w-3" />
          </Button>
        )}

        <div className="pt-3 px-3 flex items-start justify-between gap-1">
          <div className="flex-1 min-w-0">
            <Badge
              variant="outline"
              className="mb-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0"
              style={{ color: typeColor, backgroundColor: `${typeColor}15`, borderColor: typeColor }}
            >
              {noteType}
            </Badge>

            {contextHtml && (
              <div className="bg-secondary text-secondary-foreground text-[10px] italic px-2 py-0.5 rounded truncate w-full mb-2">
                {contextHtml}
              </div>
            )}
          </div>

          {/* Card-level collapse toggle — lab view only */}
          {isLab && isIssue && (
            <button
              onClick={() => setIsCardCollapsed(c => !c)}
              className="shrink-0 mt-0.5 h-5 w-5 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-white/10 transition-all duration-150"
              title={isCardCollapsed ? 'Expand card' : 'Collapse card'}
            >
              {isCardCollapsed
                ? <ChevronDown className="h-3 w-3" />
                : <ChevronUp className="h-3 w-3" />}
            </button>
          )}
        </div>

        {/* Collapsible body — hidden when card is collapsed in lab view */}
        <div
          className={cn(
            "overflow-hidden transition-all duration-300 ease-in-out",
            isCardCollapsed ? "max-h-0" : "max-h-[2000px]"
          )}
        >
          <CardContent className="px-3 pb-3 pt-1">
            <div
              ref={contentRef}
              className={cn(
                "overflow-hidden transition-all duration-500 ease-in-out relative text-sm",
                isCollapsed ? "max-h-[80px]" : "max-h-[1000px]"
              )}
            >
              <div className="whitespace-pre-wrap word-break mb-1 leading-snug break-words">
                {contentHtml}
              </div>

              {screenshotHtml && (
                <img
                  src={screenshotHtml}
                  alt="Snapshot"
                  className="w-full mt-2 rounded border border-border cursor-zoom-in"
                  onClick={() => setIsOverlayActive(true)}
                />
              )}

              {isCollapsed && (
                <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-background to-transparent" />
              )}
            </div>

            {/* Read-only Lab Status — shown in Support build for issue notes */}
            {!isLab && isIssue && (
              <div className="mt-3 pt-3 border-t border-[#333] flex flex-col gap-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Lab Status
                </div>
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: LAB_RESOLUTION_TYPES[initialLabFixType || "Pending"] || "#94a3b8" }}
                  />
                  <span
                    className="text-[11px] font-semibold"
                    style={{ color: LAB_RESOLUTION_TYPES[initialLabFixType || "Pending"] || "#94a3b8" }}
                  >
                    {initialLabFixType || "Pending"}
                  </span>
                </div>
                {initialLabComment && (
                  <div className="text-[11px] text-zinc-400 italic leading-snug">
                    "{initialLabComment}"
                  </div>
                )}
              </div>
            )}

            {/* Lab Resolution Panel — only shown in lab build for issue notes */}
            {isLab && isIssue && (
              <div className="mt-3 pt-3 border-t border-[#1e293b] flex flex-col gap-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Lab Resolution
                </div>

                {/* Show existing resolution badge if already saved */}
                {initialLabFixType && (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: LAB_RESOLUTION_TYPES[initialLabFixType] || "#9e9e9e" }}
                    />
                    <span className="font-semibold" style={{ color: LAB_RESOLUTION_TYPES[initialLabFixType] || "#9e9e9e" }}>
                      {initialLabFixType}
                    </span>
                  </div>
                )}
                {initialLabComment && (
                  <div className="text-[11px] text-slate-300 italic line-clamp-3">
                    "{initialLabComment}"
                  </div>
                )}

                <Select value={labFixType} onValueChange={setLabFixType}>
                  <SelectTrigger className="w-full text-[11px] h-7 bg-[#1e293b] border-[#334155] text-white">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: resolutionColor }}
                      />
                      <SelectValue placeholder="Select Fix Type" />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="z-[2147483647] bg-[#0f172a] border-[#1e293b] text-white">
                    {Object.entries(LAB_RESOLUTION_TYPES).map(([label, color]) => (
                      <SelectItem key={label} value={label}>
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-[11px]">{label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Textarea
                  placeholder="Add resolution comment..."
                  className="min-h-[60px] text-[11px] resize-none bg-[#1e293b] border-[#334155] text-white focus-visible:ring-0"
                  value={labComment}
                  onChange={(e) => setLabComment(e.target.value)}
                />

                <Button
                  size="sm"
                  className={cn(
                    "h-7 text-[11px] font-bold w-full transition-colors",
                    labSaved
                      ? "bg-green-700 hover:bg-green-700"
                      : "bg-[#1e3a5f] hover:bg-[#1e4a7f]"
                  )}
                  onClick={handleLabSave}
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {labSaved ? "Saved ✓" : "Save Resolution"}
                </Button>
              </div>
            )}
          </CardContent>

          {/* Author info — hidden until card is hovered */}
          {(author || lastModifiedBy) && (
            <div className="overflow-hidden max-h-0 group-hover:max-h-16 transition-all duration-300 px-3 border-t-0 group-hover:border-t group-hover:border-white/5 group-hover:pb-2 group-hover:pt-1.5 flex flex-col gap-0.5">
              {author && (
                <div className="text-[9px] text-slate-400 flex items-center gap-1 truncate">
                  <span>✍</span>
                  <span className="truncate">by {author}</span>
                </div>
              )}
              {lastModifiedBy && lastModifiedBy !== author && (
                <div className="text-[9px] text-slate-500 flex items-center gap-1 truncate">
                  <span>↻</span>
                  <span className="truncate">edited by {lastModifiedBy}</span>
                </div>
              )}
            </div>
          )}

          {isTruncatable && (
            <button
              className="w-full border-t border-border bg-secondary/30 hover:bg-secondary/60 text-muted-foreground py-1.5 flex justify-center items-center gap-1 text-xs font-medium rounded-b-lg transition-all duration-200 hover:gap-1.5"
              onClick={toggleCollapse}
            >
              {isCollapsed ? (
                <><ChevronDown className="h-3 w-3 transition-transform duration-300" /> Show more</>
              ) : (
                <><ChevronUp className="h-3 w-3 transition-transform duration-300" /> Show less</>
              )}
            </button>
          )}
        </div>
      </Card>

      {isOverlayActive && screenshotHtml && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2147483647,
            backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'zoom-out',
            padding: '24px',
            backdropFilter: 'blur(4px)',
            animation: 'pn-fade-in 0.18s ease',
          }}
          onClick={() => setIsOverlayActive(false)}
        >
          <img
            src={screenshotHtml}
            alt="Fullscreen Snapshot"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '92vw',
              maxHeight: '92vh',
              borderRadius: '10px',
              boxShadow: '0 25px 80px rgba(0,0,0,0.8)',
              animation: 'pn-zoom-in 0.2s cubic-bezier(0.34,1.56,0.64,1)',
              objectFit: 'contain',
            }}
          />
          <button
            onClick={() => setIsOverlayActive(false)}
            style={{
              position: 'fixed',
              top: '16px',
              right: '20px',
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'white',
              fontSize: '18px',
              lineHeight: 1,
              backdropFilter: 'blur(6px)',
            }}
          >✕</button>
        </div>,
        document.body
      )}
    </>
  )
}
