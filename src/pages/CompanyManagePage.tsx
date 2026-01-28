import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Building2, Plus, Pencil, Trash2, Star, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Header, Sidebar, PageContainer } from '@/components/layout'
import { CompanyForm } from '@/components/company'
import { useCompany } from '@/contexts/CompanyContext'
import { useCompanies } from '@/hooks/useCompanies'
import type { Company } from '@/types'

export function CompanyManagePage(): React.JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams()
  const { companies, currentCompany, isLoading } = useCompany()
  const {
    createCompany,
    updateCompany,
    deleteCompany,
    setDefaultCompany,
    isLoading: isOperating,
  } = useCompanies()

  const [showNewDialog, setShowNewDialog] = useState(false)
  const [editingCompany, setEditingCompany] = useState<Company | null>(null)
  const [deletingCompany, setDeletingCompany] = useState<Company | null>(null)

  // Open new dialog if ?new=1 in URL
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowNewDialog(true)
      searchParams.delete('new')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const handleCreate = async (data: Parameters<typeof createCompany>[0]) => {
    const result = await createCompany(data)
    if (result) {
      setShowNewDialog(false)
    }
  }

  const handleUpdate = async (data: Parameters<typeof createCompany>[0]) => {
    if (!editingCompany) return
    const result = await updateCompany(editingCompany.id, data)
    if (result) {
      setEditingCompany(null)
    }
  }

  const handleDelete = async () => {
    if (!deletingCompany) return
    const success = await deleteCompany(deletingCompany.id)
    if (success) {
      setDeletingCompany(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto bg-muted/30 p-6">
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-6">
          <PageContainer>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Zarządzanie firmami</h1>
                <p className="text-muted-foreground">
                  Dodawaj, edytuj i usuwaj konteksty firm
                </p>
              </div>
              <Button onClick={() => setShowNewDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Nowa firma
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {companies.map((company) => (
                <Card
                  key={company.id}
                  className={
                    company.id === currentCompany?.id
                      ? 'border-primary ring-2 ring-primary/20'
                      : ''
                  }
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{company.name}</CardTitle>
                          {company.id === currentCompany?.id && (
                            <p className="text-xs text-primary">Aktywna</p>
                          )}
                        </div>
                      </div>
                      {company.is_default && (
                        <Badge variant="secondary" className="gap-1">
                          <Star className="h-3 w-3" />
                          Domyślna
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {company.description && (
                      <p className="mb-4 text-sm text-muted-foreground">
                        {company.description}
                      </p>
                    )}
                    <Separator className="my-3" />
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingCompany(company)}
                      >
                        <Pencil className="mr-1 h-3 w-3" />
                        Edytuj
                      </Button>
                      {!company.is_default && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDefaultCompany(company.id)}
                          disabled={isOperating}
                        >
                          <Star className="mr-1 h-3 w-3" />
                          Ustaw domyślną
                        </Button>
                      )}
                      {companies.length > 1 && company.id !== currentCompany?.id && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeletingCompany(company)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          Usuń
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Add new company card */}
              <Card
                className="cursor-pointer border-dashed hover:border-primary hover:bg-primary/5"
                onClick={() => setShowNewDialog(true)}
              >
                <CardContent className="flex h-full min-h-[200px] flex-col items-center justify-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <Plus className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="mt-4 font-medium">Dodaj nową firmę</p>
                  <p className="text-sm text-muted-foreground">
                    Utwórz kolejny kontekst do pracy
                  </p>
                </CardContent>
              </Card>
            </div>
          </PageContainer>
        </main>
      </div>

      {/* New company dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nowa firma</DialogTitle>
            <DialogDescription>
              Wprowadź dane nowej firmy. Każda firma ma oddzielne faktury i płatności.
            </DialogDescription>
          </DialogHeader>
          <CompanyForm
            onSubmit={handleCreate}
            onCancel={() => setShowNewDialog(false)}
            isLoading={isOperating}
          />
        </DialogContent>
      </Dialog>

      {/* Edit company dialog */}
      <Dialog open={!!editingCompany} onOpenChange={() => setEditingCompany(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edytuj firmę</DialogTitle>
            <DialogDescription>
              Zmień dane firmy "{editingCompany?.name}"
            </DialogDescription>
          </DialogHeader>
          {editingCompany && (
            <CompanyForm
              company={editingCompany}
              onSubmit={handleUpdate}
              onCancel={() => setEditingCompany(null)}
              isLoading={isOperating}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deletingCompany} onOpenChange={() => setDeletingCompany(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usuń firmę</AlertDialogTitle>
            <AlertDialogDescription>
              Czy na pewno chcesz usunąć firmę "{deletingCompany?.name}"?
              <br />
              <strong className="text-destructive">
                Ta operacja usunie wszystkie faktury, płatności i dopasowania
                powiązane z tą firmą. Tej operacji nie można cofnąć.
              </strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isOperating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Usuń firmę
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default CompanyManagePage
