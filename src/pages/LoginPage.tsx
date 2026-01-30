import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Loader2 } from 'lucide-react'
import { DotPattern } from '@/components/ui/dot-pattern'
import { BlurFade } from '@/components/ui/blur-fade'
import { ShineBorder } from '@/components/ui/shine-border'
import { cn } from '@/lib/utils'

export function LoginPage(): React.JSX.Element {
  const navigate = useNavigate()
  const { signIn, loading, error, clearError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    clearError()

    const { error } = await signIn(email, password)
    if (!error) {
      toast.success('Zalogowano pomyślnie')
      navigate('/')
    } else {
      toast.error(
        error.message === 'Invalid login credentials'
          ? 'Nieprawidłowy email lub hasło'
          : error.message
      )
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 overflow-hidden">
      <DotPattern
        className={cn(
          "[mask-image:radial-gradient(400px_circle_at_center,white,transparent)]",
          "absolute inset-0 h-full w-full"
        )}
      />

      <BlurFade delay={0.2}>
        <ShineBorder
          className="w-full max-w-md"
          color={["#3b82f6", "#8b5cf6", "#06b6d4"]}
          borderRadius={16}
          borderWidth={2}
        >
          <Card className="w-full border-0 bg-background/80 backdrop-blur-sm">
            <CardHeader className="text-center">
              <BlurFade delay={0.3}>
                <div className="flex justify-center mb-2">
                  <img src="/spinka-logo.png" alt="Spinka" className="h-16 w-auto" />
                </div>
              </BlurFade>
              <BlurFade delay={0.4}>
                <CardDescription>Zaloguj się do swojego konta</CardDescription>
              </BlurFade>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <BlurFade delay={0}>
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        {error.message === 'Invalid login credentials'
                          ? 'Nieprawidłowy email lub hasło'
                          : error.message}
                      </AlertDescription>
                    </Alert>
                  </BlurFade>
                )}

                <BlurFade delay={0.5}>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="jan@example.com"
                      value={email}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      disabled={loading}
                    />
                  </div>
                </BlurFade>

                <BlurFade delay={0.6}>
                  <div className="space-y-2">
                    <Label htmlFor="password">Hasło</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      minLength={8}
                      disabled={loading}
                    />
                  </div>
                </BlurFade>

                <BlurFade delay={0.7}>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Logowanie...
                      </>
                    ) : (
                      'Zaloguj się'
                    )}
                  </Button>
                </BlurFade>
              </form>

              <BlurFade delay={0.8}>
                <div className="mt-6 text-center text-sm text-muted-foreground">
                  Nie masz konta?{' '}
                  <Link to="/register" className="font-medium text-primary hover:underline">
                    Zarejestruj się
                  </Link>
                </div>
              </BlurFade>
            </CardContent>
          </Card>
        </ShineBorder>
      </BlurFade>
    </div>
  )
}
