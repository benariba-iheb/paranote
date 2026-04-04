import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Trash2, CheckCircle, XCircle } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const isLab = import.meta.env.VITE_APP_TARGET === 'lab';

const ISSUE_TYPES = {
  "Content Typo": "#ff1500ff",
  "Image Typo": "#e7034fff",
  "User guide": "#cf2c0381",
  "Catalog Lab information": "#0c86e9a1",
  "Lab logo": "#0004ffff",
  "Quizzes": "#e88f1a6e",
  "Challenge validation": "#f4030334",
  "Sudoers Problem": "#d4006350",
  "Copy Command": "#fc3657ff",
  "Translation Error": "#664b00ff",
  "Service Down": "#ff9800",
  "Content Wrong": "#ff5722",
  "Instance creation": "#795548",
  "Terminal Problem": "#990033ff",
  "RDP Problem": "#202124",
  "Issue Fixed": "#4caf50",
  "Additional Info Required": "#ffeb3b",
  "No issue here": "#9e9e9e"
};

const LAB_RESOLUTION_TYPES = {
  "Issue Fixed": "#4caf50",
  "Additional Info Required": "#ffeb3b",
  "No issue here": "#9e9e9e"
};

export function EditorOverlay({
  mode,
  initialText,
  initialType,
  screenshotUrl,
  existingNote,
  onSave,
  onClose,
  onDelete
}: any) {
  const [text, setText] = useState(initialText || "")
  const [type, setType] = useState(initialType || (mode === "note" ? "Note" : "Content Typo"))
  const [image, setImage] = useState(screenshotUrl)

  const [labComment, setLabComment] = useState(existingNote?.labComment || "")
  const [labFixType, setLabFixType] = useState(existingNote?.labFixType || "Issue Fixed")

  const handlePaste = (e: any) => {
    const items = e.clipboardData.items
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile()
        if (!file) continue
        const reader = new FileReader()
        reader.onload = (event) => {
          setImage(event.target?.result as string)
        }
        reader.readAsDataURL(file)
      }
    }
  }

  const handleSave = () => {
    if (isLab && mode !== "note") {
      if (!labComment.trim()) {
        onClose()
        return
      }
      onSave(text, image, type, labComment, labFixType)
    } else {
      if (!text.trim() && !image) {
        if (initialText || screenshotUrl) onDelete()
        else onClose()
        return
      }
      onSave(text, image, type, labComment, labFixType)
    }
  }

  return (
    <Card className={`w-[320px] shadow-2xl border text-white ${isLab ? "bg-[#0f172a] border-[#1e293b]" : "bg-[#1a1a1a] border-[#333]"}`}>
      <CardHeader className="p-3 bg-secondary/30 rounded-t-lg border-b border-border flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          {mode === "note" ? "Take a Note" : (isLab ? "Fix an Issue" : "Log an Issue")}
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6"><XCircle className="h-4 w-4" /></Button>
      </CardHeader>

      <CardContent className="p-3 flex flex-col gap-3">
        {mode !== "note" && isLab && existingNote ? (
          <>
            <div className="text-xs bg-[#0f172a] p-2 rounded border border-white/10 opacity-70 mb-1">
              <span className="font-bold text-[#ffeb3b] block mb-1">Issue: {type}</span>
              <div className="italic line-clamp-3">{text}</div>
            </div>

            <Select value={labFixType} onValueChange={setLabFixType}>
              <SelectTrigger className={`w-full text-xs h-8 text-white bg-[#1e293b] border-[#334155]`}>
                <SelectValue placeholder="Select Fix Type" />
              </SelectTrigger>
              <SelectContent className={`z-[2147483647] text-white max-h-[250px] bg-[#0f172a] border-[#1e293b]`}>
                {Object.entries(LAB_RESOLUTION_TYPES).map(([label, color]) => (
                  <SelectItem key={label} value={label}>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: color as string }} />
                      <span className="truncate">{label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Textarea
              placeholder="Jot down resolution comments..."
              className={`min-h-[100px] text-sm resize-none text-white focus-visible:ring-0 bg-[#1e293b] border-[#334155]`}
              value={labComment}
              onChange={(e) => setLabComment(e.target.value)}
              onPaste={handlePaste}
              autoFocus
            />
          </>
        ) : mode !== "note" ? (
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className={`w-full text-xs h-8 text-white ${isLab ? "bg-[#1e293b] border-[#334155]" : "bg-[#2a2a2a] border-none"}`}>
              <SelectValue placeholder="Select Issue Type" />
            </SelectTrigger>
            <SelectContent className={`z-[2147483647] text-white max-h-[250px] ${isLab ? "bg-[#0f172a] border-[#1e293b]" : "bg-[#1a1a1a] border-[#333]"}`}>
              {Object.entries(ISSUE_TYPES).map(([label, color]) => (
                <SelectItem key={label} value={label}>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: color as string }} />
                    <span className="truncate">{label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {!(isLab && mode !== "note" && existingNote) && (
          <Textarea
            placeholder="Jot down notes or paste an image here..."
            className={`min-h-[100px] text-sm resize-none text-white focus-visible:ring-0 ${isLab ? "bg-[#1e293b] border-[#334155]" : "bg-[#2a2a2a] border-none"}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={handlePaste}
            autoFocus
          />
        )}

        {image && (
          <div className="relative group rounded-md overflow-hidden border">
            <img src={image} alt="Preview" className="w-full object-cover max-h-[120px]" />
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => setImage(null)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </CardContent>

      <CardFooter className="p-3 pt-0 flex gap-2">
        {(initialText || screenshotUrl) && (
          <Button variant="destructive" className="flex-1 h-8 text-xs font-semibold" onClick={onDelete}>
            <Trash2 className="h-3 w-3 mr-1" /> Delete
          </Button>
        )}
        <Button className="flex-2 w-full h-8 text-xs font-bold" onClick={handleSave}>
          <CheckCircle className="h-3 w-3 mr-1" /> Save
        </Button>
      </CardFooter>
    </Card>
  )
}
