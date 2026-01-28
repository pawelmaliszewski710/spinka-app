import { Building2, Check, Star } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Company } from '@/types'

interface CompanyCardProps {
  company: Company
  isSelected?: boolean
  onClick?: () => void
}

export function CompanyCard({ company, isSelected, onClick }: CompanyCardProps): React.JSX.Element {
  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:border-primary hover:shadow-md',
        isSelected && 'border-primary bg-primary/5 ring-2 ring-primary'
      )}
      onClick={onClick}
    >
      <CardContent className="flex items-center gap-4 p-4">
        <div
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-lg',
            isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'
          )}
        >
          <Building2 className="h-6 w-6" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold truncate">{company.name}</h3>
            {company.is_default && (
              <Badge variant="secondary" className="gap-1">
                <Star className="h-3 w-3" />
                Domyślna
              </Badge>
            )}
          </div>
          {company.description && (
            <p className="text-sm text-muted-foreground truncate">{company.description}</p>
          )}
        </div>

        {isSelected && (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-5 w-5" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default CompanyCard
