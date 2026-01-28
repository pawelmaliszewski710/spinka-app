import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, ChevronDown, Settings, Plus } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useCompany } from '@/contexts/CompanyContext'
import { cn } from '@/lib/utils'

export function CompanySwitcher(): React.JSX.Element {
  const navigate = useNavigate()
  const { currentCompany, companies, selectCompany, isLoading } = useCompany()
  const [open, setOpen] = useState(false)

  const handleSelect = (companyId: string) => {
    selectCompany(companyId)
    setOpen(false)
  }

  if (isLoading) {
    return (
      <Button variant="outline" size="sm" disabled className="w-[200px] justify-between">
        <span className="animate-pulse">Ładowanie...</span>
      </Button>
    )
  }

  if (!currentCompany) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate('/select-company')}
        className="gap-2"
      >
        <Building2 className="h-4 w-4" />
        Wybierz firmę
      </Button>
    )
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="w-[200px] justify-between">
          <span className="flex items-center gap-2 truncate">
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="truncate">{currentCompany.name}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[220px]">
        <DropdownMenuLabel>Wybierz firmę</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {companies.map((company) => (
          <DropdownMenuItem
            key={company.id}
            onClick={() => handleSelect(company.id)}
            className={cn(
              'cursor-pointer',
              company.id === currentCompany.id && 'bg-accent'
            )}
          >
            <Building2 className="mr-2 h-4 w-4" />
            <span className="truncate">{company.name}</span>
            {company.is_default && (
              <span className="ml-auto text-xs text-muted-foreground">(domyślna)</span>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            setOpen(false)
            navigate('/companies')
          }}
          className="cursor-pointer"
        >
          <Settings className="mr-2 h-4 w-4" />
          Zarządzaj firmami
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setOpen(false)
            navigate('/companies?new=1')
          }}
          className="cursor-pointer"
        >
          <Plus className="mr-2 h-4 w-4" />
          Dodaj nową firmę
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default CompanySwitcher
