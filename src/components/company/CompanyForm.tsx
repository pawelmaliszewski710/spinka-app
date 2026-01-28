import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import type { Company, CompanyInsert } from '@/types'

interface CompanyFormProps {
  company?: Company
  onSubmit: (data: Omit<CompanyInsert, 'user_id'>) => Promise<void>
  onCancel?: () => void
  isLoading?: boolean
}

export function CompanyForm({
  company,
  onSubmit,
  onCancel,
  isLoading = false,
}: CompanyFormProps): React.JSX.Element {
  const [name, setName] = useState(company?.name || '')
  const [description, setDescription] = useState(company?.description || '')
  const [isDefault, setIsDefault] = useState(company?.is_default || false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      return
    }

    await onSubmit({
      name: name.trim(),
      description: description.trim() || null,
      is_default: isDefault,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nazwa firmy *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="np. Moja Firma Sp. z o.o."
          required
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Opis (opcjonalnie)</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Krótki opis firmy..."
          rows={3}
          disabled={isLoading}
        />
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="is_default"
          checked={isDefault}
          onCheckedChange={(checked) => setIsDefault(checked === true)}
          disabled={isLoading}
        />
        <Label htmlFor="is_default" className="font-normal">
          Ustaw jako domyślną firmę
        </Label>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Anuluj
          </Button>
        )}
        <Button type="submit" disabled={isLoading || !name.trim()}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {company ? 'Zapisz zmiany' : 'Utwórz firmę'}
        </Button>
      </div>
    </form>
  )
}

export default CompanyForm
