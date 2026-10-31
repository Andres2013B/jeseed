-- ==========================================================
-- JESSED · Borrar los datos de prueba
-- Borra retos, publicaciones, comentarios, likes, reportes, opiniones,
-- galería y retos de maestros. NO borra las cuentas ni los moderadores.
-- ⚠️ No se puede deshacer.
-- ==========================================================
truncate table
  public.post_comments,
  public.post_likes,
  public.post_reports,
  public.posts,
  public.user_challenges,
  public.feedback,
  public.gallery,
  public.campaigns
restart identity;

delete from public.settings where key = 'ceremony';
