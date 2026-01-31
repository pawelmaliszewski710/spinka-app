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
  const { signIn, signInWithGoogle, loading, error, clearError } = useAuth()
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
          className="w-full max-w-2xl"
          color={["#3b82f6", "#8b5cf6", "#06b6d4"]}
          borderRadius={16}
          borderWidth={2}
        >
          <Card className="w-full border-0 bg-background/80 backdrop-blur-sm px-4">
            <CardHeader className="text-center">
              <BlurFade delay={0.3}>
                <div className="flex justify-center mb-2">
                  <a href="https://www.spinka.studio" className="hover:opacity-80 transition-opacity">
                    <img src="/spinka-logo.png" alt="Spinka - Wróć do strony głównej" className="h-16 w-auto" />
                  </a>
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

              <BlurFade delay={0.75}>
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">lub</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => signInWithGoogle()}
                  disabled={loading}
                >
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Kontynuuj z Google
                </Button>
              </BlurFade>

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
