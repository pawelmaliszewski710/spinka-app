import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { CompanySwitcher } from '@/components/company/CompanySwitcher'
import { LogOut, FileText } from 'lucide-react'

export function Header(): React.JSX.Element {
  const { user, signOut } = useAuth()

  const handleSignOut = async (): Promise<void> => {
    await signOut()
    toast.success('Wylogowano pomyślnie')
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4 md:px-6">
        <div className="flex items-center gap-2">
          <FileText className="h-6 w-6" />
          <span className="text-lg font-semibold">InvoiceMatch</span>
        </div>

        <Separator orientation="vertical" className="mx-4 h-6" />

        <nav className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            System dopasowywania faktur do płatności
          </span>
        </nav>

        <div className="ml-auto flex items-center gap-4">
          {user && (
            <>
              <CompanySwitcher />
              <Separator orientation="vertical" className="h-6" />
              <span className="text-sm text-muted-foreground">{user.email}</span>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Wyloguj
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
