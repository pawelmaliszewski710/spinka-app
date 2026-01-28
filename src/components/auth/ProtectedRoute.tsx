import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useCompany } from '@/contexts/CompanyContext'
import { Loader2 } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireCompany?: boolean
}

export function ProtectedRoute({
  children,
  requireCompany = true,
}: ProtectedRouteProps): React.JSX.Element {
  const { user, loading: authLoading } = useAuth()
  const { currentCompany, companies, isLoading: companyLoading } = useCompany()
  const location = useLocation()

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Show loading while fetching companies
  if (companyLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // If company is required and none selected, redirect to company selection
  if (requireCompany && !currentCompany) {
    // If user has no companies at all, also redirect to selection page (they'll create one there)
    if (companies.length === 0 || !currentCompany) {
      return <Navigate to="/select-company" replace />
    }
  }

  return <>{children}</>
}
