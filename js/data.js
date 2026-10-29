/* ==========================================================
   JESED · Contenido: categorías, buenas acciones, insignias y niveles
   Para agregar retos nuevos, solo agrega objetos al arreglo ACTIONS.
   ========================================================== */

const DAILY_BONUS = 10;

/* Próxima ceremonia de reconocimiento. Cambia la fecha y pon example:false cuando sea oficial. */
const CEREMONY = {
  title: 'Próxima ceremonia de Olami ORT',
  date: '2026-10-30T11:30:00-06:00',
  note: 'Reconoceremos las buenas acciones y a los alumnos destacados.',
  example: true
};
const CUSTOM_POINTS = 10;  // puntos por una buena acción escrita por el usuario

/* Protección contra acciones inventadas:
   - hay que esperar un tiempo entre aceptar un reto y marcarlo como hecho,
   - hay que contar qué se hizo y prometer que es verdad,
   - un moderador verifica cada acción antes de que sume puntos,
   - hay un máximo de acciones por día. */
const VERIFY = {
  MIN_WAIT_MIN: 15,      // minutos mínimos entre aceptar y marcar "Ya lo hice"
  MAX_PER_DAY: 5,        // acciones que se pueden enviar por día
  MIN_EVIDENCE: 20       // caracteres mínimos para contar qué hiciste
};

/* Acceso solo con correo de la escuela (dominio configurado en js/config.js) */
const SCHOOL_DOMAIN = String((window.JESED_CONFIG || {}).SCHOOL_DOMAIN || '').trim().toLowerCase();
const isSchoolEmail = email => {
  const e = String(email || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+$/.test(e) && (!SCHOOL_DOMAIN || e.endsWith('@' + SCHOOL_DOMAIN));
};
const SCHOOL_EMAIL_ERROR = `Solo puedes entrar con tu correo de la escuela (@${SCHOOL_DOMAIN}).`;

const CATEGORIES = [
  { id: 'familia',     name: 'Familia',              icon: '🏡', color: '#FF7849', desc: 'El Jesed empieza en casa.' },
  { id: 'escuela',     name: 'En la escuela',        icon: '🏫', color: '#0EA5A4', desc: 'Tu salón y tu escuela, un lugar mejor.' },
  { id: 'amigos',      name: 'Amigos',               icon: '🤝', color: '#F5A524', desc: 'Sé el amigo que te gustaría tener.' },
  { id: 'comunidad',   name: 'Comunidad',            icon: '🌍', color: '#1F9D63', desc: 'Haz de tu entorno un lugar mejor.' },
  { id: 'olami',       name: 'Olami',                icon: '✡️', color: '#2457D6', desc: 'Construyamos juntos nuestra comunidad.' },
  { id: 'ayuda',       name: 'Ayuda a los demás',    icon: '🙌', color: '#E2507A', desc: 'Una mano a tiempo cambia un día entero.' },
  { id: 'crecimiento', name: 'Crecimiento personal', icon: '🌱', color: '#7C5CE0', desc: 'Ser mejor persona también es Jesed.' }
];

const ACTIONS = [
  // Familia
  { id: 'f1', category: 'familia', icon: '🧽', points: 10, title: 'Ayuda en casa sin que te lo recuerden', desc: 'Lava los platos, tiende tu cama o saca la basura antes de que alguien te lo pida.' },
  { id: 'f2', category: 'familia', icon: '💌', points: 10, title: 'Agradece a una persona importante para ti', desc: 'Dile o escríbele a alguien de tu familia por qué es importante en tu vida.' },
  { id: 'f3', category: 'familia', icon: '📞', points: 15, title: 'Llama o visita a tus abuelos', desc: 'Hazles una llamada o visita solo para saber cómo están y escuchar sus historias.' },
  { id: 'f5', category: 'familia', icon: '🥞', points: 20, title: 'Cocina algo para tu familia', desc: 'Prepara un desayuno, un postre o una botana para compartir con todos.' },
  { id: 'f6', category: 'familia', icon: '📝', points: 10, title: 'Deja una nota sorpresa', desc: 'Escribe un mensaje bonito y déjalo donde alguien de tu familia lo encuentre.' },

  // En la escuela
  { id: 'e1',  category: 'escuela', icon: '👋', points: 10, title: 'Saluda a alguien nuevo en el recreo', desc: 'Platica con alguien de otro salón o grado con quien casi nunca hablas.' },
  { id: 'e2',  category: 'escuela', icon: '🍎', points: 10, title: 'Agradece a un maestro', desc: 'Dile a un maestro qué te gustó de su clase o escríbele una nota de gracias.' },
  { id: 'e3',  category: 'escuela', icon: '🧹', points: 10, title: 'Deja tu salón más limpio', desc: 'Al final del día recoge la basura, acomoda las sillas y borra el pizarrón sin que te lo pidan.' },
  { id: 'e4',  category: 'escuela', icon: '📖', points: 15, title: 'Sé tutor por un día', desc: 'Ayuda a un compañero a entender un tema que a ti se te facilita.' },
  { id: 'e5',  category: 'escuela', icon: '🪑', points: 10, title: 'Siéntate con alguien diferente', desc: 'En el comedor o en el recreo, comparte la mesa con alguien que esté solo.' },
  { id: 'e6',  category: 'escuela', icon: '✏️', points: 10, title: 'Presta tu material', desc: 'Comparte tu lápiz, tus colores o tu calculadora con quien lo necesite.' },
  { id: 'e7',  category: 'escuela', icon: '🙋', points: 10, title: 'Participa con respeto', desc: 'Levanta la mano, escucha a tus compañeros y no interrumpas en toda una clase.' },
  { id: 'e8',  category: 'escuela', icon: '🛡️', points: 20, title: 'Defiende a quien molestan', desc: 'Si ves que alguien se burla de un compañero, no te rías: apóyalo o avisa a un maestro.' },
  { id: 'e9',  category: 'escuela', icon: '🤝', points: 15, title: 'Recibe a un alumno nuevo', desc: 'Enséñale la escuela, preséntale a tu grupo y ayúdale a que se sienta en casa.' },
  { id: 'e10', category: 'escuela', icon: '🧑‍🔧', points: 10, title: 'Agradece al personal de la escuela', desc: 'Da las gracias por su nombre a intendencia, cafetería, seguridad o la recepción.' },
  { id: 'e11', category: 'escuela', icon: '🔎', points: 10, title: 'Devuelve algo perdido', desc: 'Si encuentras algo que no es tuyo, búscale dueño o llévalo a objetos perdidos.' },
  { id: 'e12', category: 'escuela', icon: '💬', points: 10, title: 'Deja un post-it de ánimo', desc: 'Pega un mensaje positivo en el locker o la banca de un compañero antes de un examen.' },
  { id: 'e13', category: 'escuela', icon: '👥', points: 15, title: 'Haz equipo con quien queda solo', desc: 'Cuando armen equipos, invita a quien nadie ha elegido.' },
  { id: 'e14', category: 'escuela', icon: '🌱', points: 10, title: 'Cuida tu escuela', desc: 'Apaga luces y ventiladores que nadie usa, cierra las llaves y cuida las plantas.' },
  { id: 'e16', category: 'escuela', icon: '🎒', points: 15, title: 'Ayuda a un alumno más pequeño', desc: 'Acompaña, ayuda con su mochila o juega un rato con alguien de primaria.' },

  // Amigos
  { id: 'a1', category: 'amigos', icon: '📚', points: 10, title: 'Haz algo amable por un compañero', desc: 'Préstale tus apuntes, ayúdale con una tarea o compártele de tu lunch.' },
  { id: 'a2', category: 'amigos', icon: '👂', points: 15, title: 'Dedica tiempo a escuchar a alguien', desc: 'Pregúntale a un amigo cómo está de verdad y escúchalo sin interrumpir.' },
  { id: 'a3', category: 'amigos', icon: '🫂', points: 15, title: 'Incluye a alguien que esté solo', desc: 'Invita a alguien que esté solo a sentarse contigo o a unirse a tu grupo.' },
  { id: 'a4', category: 'amigos', icon: '👏', points: 10, title: 'Felicita un logro', desc: 'Reconoce en voz alta algo que un amigo hizo bien. Que se entere de que lo notaste.' },
  { id: 'a5', category: 'amigos', icon: '🕊️', points: 20, title: 'Da el primer paso para reconciliarte', desc: 'Busca arreglar un pleito o malentendido, aunque no sepas quién empezó.' },
  { id: 'a6', category: 'amigos', icon: '💬', points: 10, title: 'Manda un mensaje de ánimo', desc: 'Escríbele a un amigo que esté pasando por un momento difícil. Unas palabras pueden cambiar su día.' },

  // Comunidad
  { id: 'c1', category: 'comunidad', icon: '🧹', points: 15, title: 'Recoge basura en un espacio público', desc: 'En el parque, la calle o la escuela: deja el lugar mejor de como lo encontraste.' },
  { id: 'c2', category: 'comunidad', icon: '👕', points: 20, title: 'Dona ropa o juguetes que ya no uses', desc: 'Junta lo que está en buen estado y llévalo a quien lo pueda aprovechar.' },
  { id: 'c3', category: 'comunidad', icon: '🙏', points: 10, title: 'Agradece a quienes trabajan por ti', desc: 'Saluda por su nombre y da las gracias al guardia, al conserje o al chofer.' },
  { id: 'c4', category: 'comunidad', icon: '🏘️', points: 15, title: 'Ayuda a un vecino', desc: 'Cárgale las bolsas, riégale las plantas u ofrécele una mano con algo que necesite.' },
  { id: 'c5', category: 'comunidad', icon: '🤲', points: 20, title: 'Participa en un voluntariado', desc: 'Dedica unas horas a una causa: comedor comunitario, colecta, refugio de animales…' },
  { id: 'c6', category: 'comunidad', icon: '🌳', points: 10, title: 'Cuida un espacio compartido', desc: 'Riega las plantas de la entrada, acomoda las sillas o apaga las luces que nadie usa.' },

  // Olami
  { id: 'o1', category: 'olami', icon: '🎉', points: 20, title: 'Participa en una actividad comunitaria de Olami', desc: 'Lánzate a la próxima actividad, clase o evento y llega con buena actitud.' },
  { id: 'o2', category: 'olami', icon: '📣', points: 20, title: 'Invita a un amigo a Olami', desc: 'Lleva a alguien nuevo a una clase o evento y preséntale a la comunidad.' },
  { id: 'o3', category: 'olami', icon: '👋', points: 15, title: 'Recibe a alguien nuevo', desc: 'Preséntate y haz sentir bienvenido a quien llega por primera vez.' },
  { id: 'o4', category: 'olami', icon: '🪑', points: 15, title: 'Ayuda a preparar un evento', desc: 'Llega antes para acomodar sillas, servir, decorar o recoger al final.' },
  { id: 'o5', category: 'olami', icon: '🪙', points: 15, title: 'Da tzedaká', desc: 'Separa una parte de tu dinero o tu tiempo para alguien que lo necesite.' },
  { id: 'o6', category: 'olami', icon: '💡', points: 10, title: 'Comparte lo que aprendiste', desc: 'Platícale a alguien una idea o enseñanza que te haya gustado de una clase.' },

  // Ayuda a los demás
  { id: 'h1', category: 'ayuda', icon: '🦸', points: 10, title: 'Ayuda a alguien sin que te lo pida', desc: 'Fíjate quién necesita una mano y ofrécela antes de que te la pidan.' },
  { id: 'h2', category: 'ayuda', icon: '💺', points: 10, title: 'Cede tu lugar', desc: 'En el transporte, en una fila o donde alguien lo necesite más que tú.' },
  { id: 'h3', category: 'ayuda', icon: '🧠', points: 15, title: 'Enseña algo que sabes', desc: 'Explícale a alguien un tema de la escuela o algo que domines.' },
  { id: 'h4', category: 'ayuda', icon: '👵', points: 15, title: 'Ayuda a un adulto mayor', desc: 'Acompáñalo, ayúdalo con la tecnología o con sus compras.' },
  { id: 'h5', category: 'ayuda', icon: '🥪', points: 15, title: 'Comparte tu comida', desc: 'Invita algo a alguien que lo necesite o compártelo con quien no trajo.' },
  { id: 'h6', category: 'ayuda', icon: '🎁', points: 20, title: 'Haz un favor anónimo', desc: 'Haz algo bueno por alguien sin que sepa que fuiste tú.' },

  // Crecimiento personal
  { id: 'g1', category: 'crecimiento', icon: '📓', points: 10, title: 'Agradece por 3 cosas', desc: 'Escribe tres cosas por las que estés agradecido hoy.' },
  { id: 'g2', category: 'crecimiento', icon: '🤐', points: 15, title: 'Habla bien de los demás', desc: 'Pasa un día entero sin chismes ni críticas. Cuida tus palabras.' },
  { id: 'g3', category: 'crecimiento', icon: '🙇', points: 15, title: 'Pide perdón', desc: 'Reconoce un error y discúlpate sinceramente con quien lastimaste.' },
  { id: 'g4', category: 'crecimiento', icon: '🤞', points: 10, title: 'Cumple una promesa', desc: 'Eso que dijiste que harías… hoy es el día.' },
  { id: 'g5', category: 'crecimiento', icon: '🧘', points: 10, title: 'Sé paciente', desc: 'Cuando algo te desespere, respira y responde con calma y respeto.' },
  { id: 'g6', category: 'crecimiento', icon: '😊', points: 10, title: 'Sonríe y saluda a todos', desc: 'Saluda con una sonrisa a cada persona con la que te cruces hoy.' }
];

const LEVELS = [
  { min: 0,    name: 'Semilla',           icon: '🌰' },
  { min: 50,   name: 'Brote',             icon: '🌱' },
  { min: 150,  name: 'Raíz',              icon: '🌿' },
  { min: 300,  name: 'Árbol',             icon: '🌳' },
  { min: 500,  name: 'Bosque',            icon: '🌲' },
  { min: 800,  name: 'Luz',               icon: '✨' },
  { min: 1200, name: 'Corazón de Jesed',  icon: '💙' }
];

/* Cada insignia recibe las estadísticas del usuario (ver computeStats en app.js) */
const BADGES = [
  { id: 'primer-paso', icon: '👣', name: 'Primer paso',        desc: 'Completa tu primera buena acción',      check: s => s.done.length >= 1 },
  { id: 'constante',   icon: '🔥', name: 'Constante',          desc: 'Completa 5 buenas acciones',            check: s => s.done.length >= 5 },
  { id: 'corazon-oro', icon: '💛', name: 'Corazón de oro',     desc: 'Completa 15 buenas acciones',           check: s => s.done.length >= 15 },
  { id: 'familia',     icon: '🏡', name: 'Orgullo de casa',    desc: '3 acciones de Familia',                 check: s => (s.byCat.familia || 0) >= 3 },
  { id: 'escuela',     icon: '🏫', name: 'Orgullo Olami ORT',  desc: '3 acciones En la escuela',              check: s => (s.byCat.escuela || 0) >= 3 },
  { id: 'amigos',      icon: '🤝', name: 'Gran amigo',         desc: '3 acciones de Amigos',                  check: s => (s.byCat.amigos || 0) >= 3 },
  { id: 'comunidad',   icon: '🌍', name: 'Vecino ejemplar',    desc: '3 acciones de Comunidad',               check: s => (s.byCat.comunidad || 0) >= 3 },
  { id: 'olami',       icon: '✡️', name: 'Espíritu Olami',     desc: '3 acciones de Olami',                   check: s => (s.byCat.olami || 0) >= 3 },
  { id: 'ayuda',       icon: '🙌', name: 'Manos que ayudan',   desc: '3 acciones de Ayuda a los demás',       check: s => (s.byCat.ayuda || 0) >= 3 },
  { id: 'crecimiento', icon: '🌱', name: 'En crecimiento',     desc: '3 acciones de Crecimiento personal',    check: s => (s.byCat.crecimiento || 0) >= 3 },
  { id: 'explorador',  icon: '🧭', name: 'Explorador del bien', desc: 'Al menos una acción en cada categoría', check: s => CATEGORIES.every(c => (s.byCat[c.id] || 0) >= 1) },
  { id: 'racha-3',     icon: '⚡', name: 'Racha de 3 días',    desc: 'Haz Jesed 3 días seguidos',             check: s => s.bestStreak >= 3 },
  { id: 'racha-7',     icon: '🌟', name: 'Semana de Jesed',    desc: 'Haz Jesed 7 días seguidos',             check: s => s.bestStreak >= 7 },
  { id: 'diario',      icon: '📅', name: 'Fiel al reto diario', desc: 'Cumple 3 retos del día',               check: s => s.dailyCount >= 3 },
  { id: 'cien',        icon: '💯', name: 'Cien puntos',        desc: 'Llega a 100 puntos',                    check: s => s.points >= 100 }
];

const CHEERS = [
  'Cada buena acción hace el mundo un poquito mejor.',
  'Tu Jesed ya está haciendo eco.',
  'El bien se contagia: ¡sigue así!',
  'Pequeñas acciones, grandes cambios.',
  'Alguien hoy tuvo un mejor día gracias a ti.'
];

/* Moderación del lado del cliente (la base de datos repite estas reglas en supabase/schema.sql) */
const Moderation = (() => {
  const BANNED = [
    'idiota', 'estupido', 'estupida', 'pendejo', 'pendeja', 'pendejada', 'imbecil', 'tarado', 'tarada',
    'tonto', 'tonta', 'baboso', 'babosa', 'menso', 'mensa', 'puto', 'puta', 'mierda', 'chingar', 'chingada',
    'chingado', 'chinga', 'verga', 'culero', 'culera', 'pinche', 'marica', 'maricon', 'joto', 'zorra', 'perra',
    'cabron', 'cabrona', 'mamada', 'mamadas', 'naco', 'naca', 'ojete', 'retrasado', 'retrasada', 'mongol',
    'asqueroso', 'asquerosa', 'nazi', 'fuck', 'shit', 'bitch', 'stupid', 'idiot'
  ];
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const wordRe = new RegExp('\\b(' + BANNED.join('|') + ')\\b', 'i');
  const contactRe = /(https?:\/\/|www\.|\.com\b|@[a-z0-9_.]{3,}|\d[\d\s-]{6,}\d)/i;

  function isClean(text) { return !wordRe.test(norm(text)); }

  function check(text) {
    const t = String(text || '').trim();
    if (t.length < 5) return { ok: false, reason: 'Escribe al menos 5 caracteres.' };
    if (t.length > 280) return { ok: false, reason: 'Máximo 280 caracteres.' };
    const n = norm(t);
    if (wordRe.test(n)) return { ok: false, reason: 'Tu mensaje tiene palabras que no van con el espíritu de Jesed. ¡Inténtalo de nuevo con buena onda! 💙' };
    if (contactRe.test(n)) return { ok: false, reason: 'Por seguridad no se permiten links, usuarios de redes ni teléfonos.' };
    return { ok: true };
  }

  return { check, isClean, norm, BANNED };
})();
