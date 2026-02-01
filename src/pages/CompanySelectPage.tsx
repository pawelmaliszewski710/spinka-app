import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Plus, Loader2, LogOut, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CompanyCard, CompanyForm } from '@/components/company'
import { useCompany } from '@/contexts/CompanyContext'
import { useCompanies } from '@/hooks/useCompanies'
import { useAuth } from '@/hooks/useAuth'
import { DotPattern } from '@/components/ui/dot-pattern'
import { BlurFade } from '@/components/ui/blur-fade'
import { ShineBorder } from '@/components/ui/shine-border'
import { cn } from '@/lib/utils'

export function CompanySelectPage(): React.JSX.Element {
  const navigate = useNavigate()
  const { companies, currentCompany, selectCompany, isLoading } = useCompany()
  const { createCompany, isLoading: isCreating } = useCompanies()
  const { user, signOut } = useAuth()
  const [showNewDialog, setShowNewDialog] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const handleSelect = (companyId: string) => {
    selectCompany(companyId)
    navigate('/')
  }

  const handleCreateCompany = async (data: Parameters<typeof createCompany>[0]) => {
    const newCompany = await createCompany(data)
    if (newCompany) {
      setShowNewDialog(false)
      selectCompany(newCompany.id)
      navigate('/')
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4 overflow-hidden">
      {/* User menu in top-right corner */}
      <div className="absolute top-4 right-4 z-10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <User className="h-4 w-4" />
              <span className="max-w-[200px] truncate">{user?.email}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Moje konto</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
              {user?.email}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Wyloguj się
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <DotPattern
        className={cn(
          "[mask-image:radial-gradient(400px_circle_at_center,white,transparent)]",
          "absolute inset-0 h-full w-full"
        )}
      />

      <BlurFade delay={0.2}>
        <ShineBorder
          className="w-full max-w-lg"
          color={["#3b82f6", "#8b5cf6", "#06b6d4"]}
          borderRadius={16}
          borderWidth={2}
        >
          <Card className="w-full border-0 bg-background/80 backdrop-blur-sm">
            <CardHeader className="text-center">
              <BlurFade delay={0.3}>
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Building2 className="h-8 w-8 text-primary" />
                </div>
              </BlurFade>
              <BlurFade delay={0.4}>
                <CardTitle className="text-2xl">Wybierz firmę</CardTitle>
              </BlurFade>
              <BlurFade delay={0.5}>
                <CardDescription>
                  {companies.length > 0
                    ? 'Wybierz kontekst firmy, w którym chcesz pracować'
                    : 'Utwórz swoją pierwszą firmę, aby rozpocząć pracę'}
                </CardDescription>
              </BlurFade>
            </CardHeader>
            <CardContent className="space-y-4">
              {companies.length > 0 ? (
                <>
                  <div className="space-y-3">
                    {companies.map((company, index) => (
                      <BlurFade key={company.id} delay={0.5 + index * 0.1}>
                        <CompanyCard
                          company={company}
                          isSelected={currentCompany?.id === company.id}
                          onClick={() => handleSelect(company.id)}
                        />
                      </BlurFade>
                    ))}
                  </div>

                  <BlurFade delay={0.6 + companies.length * 0.1}>
                    <div className="pt-4">
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setShowNewDialog(true)}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Dodaj nową firmę
                      </Button>
                    </div>
                  </BlurFade>
                </>
              ) : (
                <div className="space-y-4">
                  <BlurFade delay={0.6}>
                    <div className="rounded-lg border border-dashed p-8 text-center">
                      <Building2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
                      <p className="mt-4 text-muted-foreground">
                        Nie masz jeszcze żadnej firmy
                      </p>
                    </div>
                  </BlurFade>

                  <BlurFade delay={0.7}>
                    <Button className="w-full" onClick={() => setShowNewDialog(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Utwórz pierwszą firmę
                    </Button>
                  </BlurFade>
                </div>
              )}
            </CardContent>
          </Card>
        </ShineBorder>
      </BlurFade>

      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nowa firma</DialogTitle>
            <DialogDescription>
              Wprowadź dane nowej firmy. Możesz je później zmienić.
            </DialogDescription>
          </DialogHeader>
          <CompanyForm
            onSubmit={handleCreateCompany}
            onCancel={() => setShowNewDialog(false)}
            isLoading={isCreating}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default CompanySelectPage
