import { Header } from './Header'
import { Sidebar } from './Sidebar'

interface PageContainerProps {
  children: React.ReactNode
}

export function PageContainer({ children }: PageContainerProps): React.JSX.Element {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
