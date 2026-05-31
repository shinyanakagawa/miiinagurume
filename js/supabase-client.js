// ============================================================
// Supabase クライアント設定
// SUPABASE_URL と SUPABASE_ANON_KEY を自分のプロジェクトの値に変更してください
// ============================================================

const SUPABASE_URL      = 'https://fgwoqrnjrsnnhogxvtof.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_CmlWeDTHmnnyCQZ2luPqxg_1g5NdBsU';

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- 飲食店 ------------------------------------------------

/** 全飲食店を取得 */
export async function getRestaurants(filters = {}) {
  let query = supabase.from('restaurants').select('*').order('visit_date', { ascending: false });
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.area)     query = query.eq('area', filters.area);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/** 飲食店を1件登録 */
export async function addRestaurant(restaurant) {
  const { data, error } = await supabase.from('restaurants').insert([restaurant]).select();
  if (error) throw error;
  return data[0];
}

// ---- 投稿管理 -----------------------------------------------

/** 全投稿を取得（飲食店名も含む） */
export async function getPosts() {
  const { data, error } = await supabase
    .from('posts')
    .select('*, restaurants(name)')
    .order('post_date', { ascending: false });
  if (error) throw error;
  return data;
}

/** 投稿を1件登録 */
export async function addPost(post) {
  const { data, error } = await supabase.from('posts').insert([post]).select();
  if (error) throw error;
  return data[0];
}

// ---- PR案件 -------------------------------------------------

/** PR案件を全件取得 */
export async function getPrCampaigns() {
  const { data, error } = await supabase
    .from('pr_campaigns')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ---- お問い合わせ -------------------------------------------

/** お問い合わせを送信 */
export async function submitContact(contact) {
  const { data, error } = await supabase.from('contacts').insert([contact]).select();
  if (error) throw error;
  return data[0];
}