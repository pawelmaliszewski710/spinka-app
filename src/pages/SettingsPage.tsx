import { Settings, Cloud, Bot, Plug } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageContainer } from '@/components/layout'
import { FakturowniaSettingsForm } from '@/components/settings/FakturowniaSettingsForm'
import { AiSettingsForm } from '@/components/settings/AiSettingsForm'
import { useCompany } from '@/contexts/CompanyContext'
import { BlurFade } from '@/components/ui/blur-fade'
import { OnboardingTip } from '@/components/onboarding'

export function SettingsPage(): React.JSX.Element {
  const { currentCompany } = useCompany()

  return (
    <PageContainer>
      <BlurFade delay={0.1}>
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Settings className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Ustawienia</h1>
              <p className="text-muted-foreground">
                Konfiguracja integracji dla {currentCompany?.name || 'firmy'}
              </p>
            </div>
          </div>
        </div>
      </BlurFade>

      <BlurFade delay={0.15}>
        <OnboardingTip
          id="settings-intro"
          title="Skonfiguruj integrację z Fakturownia"
          description="Połącz swoje konto Fakturownia.pl, aby automatycznie pobierać faktury bez ręcznego eksportu CSV."
          icon={<Plug className="h-5 w-5" />}
          variant="info"
          steps={[
            {
              title: 'Włącz integrację',
              description: 'Kliknij przełącznik "Włącz integrację" na samej górze formularza',
            },
            {
              title: 'Wpisz subdomenę',
              description: 'To nazwa Twojego konta w Fakturownia (np. "mojafirma" z mojafirma.fakturownia.pl)',
            },
            {
              title: 'Wklej klucz API',
              description: 'Znajdziesz go w Fakturownia: Ustawienia → Ustawienia konta → Integracja',
            },
            {
              title: 'Opcjonalnie: ID działu',
              description: 'Jeśli masz wiele działów, podaj ID konkretnego działu do importu',
            },
          ]}
          className="mb-6"
        />
      </BlurFade>

      <Tabs defaultValue="integrations" className="space-y-6">
        <BlurFade delay={0.2}>
          <TabsList>
            <TabsTrigger value="integrations" className="flex items-center gap-2">
              <Cloud className="h-4 w-4" />
              Integracje
            </TabsTrigger>
            <TabsTrigger value="ai" className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              AI
            </TabsTrigger>
          </TabsList>
        </BlurFade>

        <TabsContent value="integrations" className="space-y-6">
          <BlurFade delay={0.3}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Fakturownia.pl
                </CardTitle>
                <CardDescription>
                  Połącz swoje konto Fakturownia, aby automatycznie importować faktury.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FakturowniaSettingsForm />
              </CardContent>
            </Card>
          </BlurFade>
        </TabsContent>

        <TabsContent value="ai" className="space-y-6">
          <BlurFade delay={0.3}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Ustawienia AI
                </CardTitle>
                <CardDescription>
                  Skonfiguruj własny klucz API dla funkcji AI (opcjonalnie).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AiSettingsForm />
              </CardContent>
            </Card>
          </BlurFade>
        </TabsContent>
      </Tabs>
    </PageContainer>
  )
}

export default SettingsPage
