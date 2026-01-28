/**
 * AI Fakturownia Chat Page
 *
 * Allows users to ask questions about invoices, payments, and reports
 * using natural language processed by AI.
 */

import { PageContainer } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ChatContainer } from '@/components/chat'
import { Bot } from 'lucide-react'
import { BlurFade } from '@/components/ui/blur-fade'

export function AiChatPage(): React.JSX.Element {
  return (
    <PageContainer>
      <div className="space-y-6">
        <BlurFade delay={0.1}>
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                AI Fakturownia
              </CardTitle>
              <CardDescription>
                Zadawaj pytania o faktury, płatności i zaległości w naturalnym języku
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ChatContainer />
            </CardContent>
          </Card>
        </BlurFade>
      </div>
    </PageContainer>
  )
}
