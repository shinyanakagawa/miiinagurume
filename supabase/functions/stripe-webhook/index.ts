// ============================================================
// Supabase Edge Function: stripe-webhook
// Stripeからのサブスクリプション関連イベントを受け取り、
// sites テーブルの subscription_status を更新する。
//
// 必要な環境変数（supabase secrets set で設定）:
//   STRIPE_SECRET_KEY         Stripeのシークレットキー
//   STRIPE_WEBHOOK_SECRET     このエンドポイント用のWebhook署名シークレット
//   SUPABASE_URL              （Supabaseが自動で注入）
//   SUPABASE_SERVICE_ROLE_KEY （Supabaseが自動で注入）
//
// Stripeダッシュボードで以下のイベントを購読してください:
//   checkout.session.completed
//   customer.subscription.updated
//   customer.subscription.deleted
// ============================================================

import Stripe from 'npm:stripe@16';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function mapStripeStatus(status: string): string {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    default:
      return 'canceled';
  }
}

// 更新結果を必ず確認する。エラーや0件マッチ（site_idが存在しない・削除済み等）を
// 握りつぶすと、Stripeには200を返してしまうため再送されず、課金状態の反映漏れが
// ログにも残らず完全に見えなくなる。ここでは（再送ストームを避けるため）Stripeへの
// レスポンス自体は変えず、Edge Functionのログに必ず残すことで可観測性を確保する。
async function updateBySiteId(siteId: string, patch: Record<string, unknown>) {
  const { data, error } = await supabase.from('sites').update(patch).eq('id', siteId).select('id');
  if (error) {
    console.error(`sites更新に失敗しました（site_id=${siteId}）:`, error, patch);
  } else if (!data || data.length === 0) {
    console.error(`sites更新が0件マッチでした。site_idが存在しないか削除済みの可能性があります（site_id=${siteId}）:`, patch);
  }
}

async function updateBySubscriptionId(subscriptionId: string, patch: Record<string, unknown>) {
  const { data, error } = await supabase.from('sites').update(patch).eq('stripe_subscription_id', subscriptionId).select('id');
  if (error) {
    console.error(`sites更新に失敗しました（stripe_subscription_id=${subscriptionId}）:`, error, patch);
  } else if (!data || data.length === 0) {
    console.error(`sites更新が0件マッチでした。該当するstripe_subscription_idがありません（stripe_subscription_id=${subscriptionId}）:`, patch);
  }
}

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
    );
  } catch (err) {
    return new Response(`Webhook signature verification failed: ${err}`, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const siteId = session.metadata?.site_id;
      if (siteId && session.subscription) {
        await updateBySiteId(siteId, {
          subscription_status: 'active',
          stripe_subscription_id: session.subscription as string,
        });
      }
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const status = mapStripeStatus(subscription.status);
      const siteId = subscription.metadata?.site_id;
      if (siteId) {
        await updateBySiteId(siteId, { subscription_status: status });
      } else {
        await updateBySubscriptionId(subscription.id, { subscription_status: status });
      }
      break;
    }
    default:
      // 未対応のイベントは無視
      break;
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
