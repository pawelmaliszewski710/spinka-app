import { useCallback, useState } from 'react'
import { Upload, File, X, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { MAX_FILE_SIZE } from '@/lib/constants'

interface FileDropzoneProps {
  accept: string
  maxSize?: number
  onFileSelect: (file: File) => void
  selectedFile: File | null
  onClear: () => void
  label: string
  hint?: string
  disabled?: boolean
}

export function FileDropzone({
  accept,
  maxSize = MAX_FILE_SIZE,
  onFileSelect,
  selectedFile,
  onClear,
  label,
  hint,
  disabled = false,
}: FileDropzoneProps): React.JSX.Element {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validateFile = useCallback(
    (file: File): boolean => {
      setError(null)

      if (file.size > maxSize) {
        const maxMB = Math.round(maxSize / 1024 / 1024)
        setError(`Plik jest za duży. Maksymalny rozmiar: ${maxMB} MB`)
        return false
      }

      // Check file extension
      const acceptedExtensions = accept.split(',').map((ext) => ext.trim().toLowerCase())
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase()

      if (!acceptedExtensions.some((ext) => ext === fileExtension || ext === '*')) {
        setError(`Nieprawidłowy format pliku. Dozwolone: ${accept}`)
        return false
      }

      return true
    },
    [accept, maxSize]
  )

  const handleFile = useCallback(
    (file: File) => {
      if (validateFile(file)) {
        onFileSelect(file)
      }
    },
    [validateFile, onFileSelect]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      if (disabled) return

      const files = e.dataTransfer.files
      if (files.length > 0) {
        handleFile(files[0])
      }
    },
    [disabled, handleFile]
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        handleFile(files[0])
      }
      // Reset input value to allow selecting the same file again
      e.target.value = ''
    },
    [handleFile]
  )

  const handleClear = useCallback(() => {
    setError(null)
    onClear()
  }, [onClear])

  if (selectedFile) {
    return (
      <div className="rounded-lg border bg-muted/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <File className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">{selectedFile.name}</p>
              <p className="text-sm text-muted-foreground">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClear}
            disabled={disabled}
            aria-label="Usuń plik"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <label
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50',
          disabled && 'cursor-not-allowed opacity-50'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept={accept}
          onChange={handleInputChange}
          className="sr-only"
          disabled={disabled}
        />
        <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
        <p className="text-center font-medium">{label}</p>
        {hint && <p className="mt-1 text-center text-sm text-muted-foreground">{hint}</p>}
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Przeciągnij i upuść lub kliknij aby wybrać
        </p>
      </label>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
