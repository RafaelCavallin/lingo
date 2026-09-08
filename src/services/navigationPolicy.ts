import type { SignInPlan } from './auth'

/**
 * Evento que pode devolver o usuário à tela principal (Home). `deck-created`
 * cobre sair do estado "sem baralho ativo"; `sign-in-settled` cobre um login
 * concluído — direto ou depois do diálogo de juntar/descartar dados.
 */
export type NavigationTrigger =
  | { kind: 'deck-created' }
  | { kind: 'sign-in-settled'; userInitiated: boolean; plan: SignInPlan | null }

/**
 * Função pura e total: nunca lança, apenas decide se o evento deve levar o
 * usuário à Home. Um evento de sessão que o próprio usuário não iniciou
 * (restauro no boot, reemissão em segundo plano) nunca redireciona — só
 * cancelar o diálogo de dados tem o mesmo efeito quando o login foi iniciado
 * pelo usuário.
 */
export function shouldReturnHome(trigger: NavigationTrigger): boolean {
  if (trigger.kind === 'deck-created') return true
  if (!trigger.userInitiated) return false
  return trigger.plan !== 'cancel'
}
