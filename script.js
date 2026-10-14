/* ==========================================================
	1. DATOS
   ========================================================== */

// Clave de localStorage del horario
const KEY = 'horario2dam-v2';

// Estado nuevo y VACÍO: sin asignaturas ni clases y sin configurar (setup = null)
// - setup: { inst, curso } (se piden la primera vez)
// - subjects: asignaturas { clave: { c: abreviatura, n: nombre, t: profesor/a, h: tono de color 0-359 } }
// - sched: matriz [día][franja] con la clave de la materia (5 días x 6 franjas)
// - split: matriz [día][franja] que indica si esa franja está "separada" de la anterior
const DEF = () => ({
	setup: null,
	subjects: {},
	sched: Array.from({ length: 5 }, () => Array(6).fill(null)),
	split: Array.from({ length: 5 }, () => Array(6).fill(false))
});

// Datos del centro de los horarios creados con la versión antigua (que no guardaba instituto ni curso):
// así, al cargar uno de esos horarios o un Gist antiguo no se vuelve a pedir nada
const ANTIGUO = { inst: 'Victoria Institute of Technology · Sanlúcar de Barrameda', curso: '2DAM' };
const conAsignaturas = x => !!x && !!x.subjects && Object.keys(x.subjects).length > 0;

/* ==========================================================
	2. CARGA DEL ESTADO (localStorage)
   ========================================================== */

// "st" es el estado actual de la aplicación
let st;
try {
	st = JSON.parse(localStorage.getItem(KEY));
} catch (e) { }

// Si no hay datos válidos (persona nueva), se parte de un horario vacío
if (!st || !st.sched || !st.split || !st.subjects) st = DEF();
if (!st.setup) st.setup = conAsignaturas(st) ? { ...ANTIGUO } : null; // horario antiguo: se le asignan los datos del centro; si está vacío, se pide la configuración

// Calendario: lista de eventos { id, d: fecha AAAA-MM-DD, t: 'exam' | 'holiday', n: descripción, s: clave de la asignatura (solo exámenes) }
// Se guarda aparte para que "Restablecer" no borre los exámenes ni los festivos
const KEV = 'horario2dam-eventos';
let eventos = [];
try {
	eventos = JSON.parse(localStorage.getItem(KEV)) || [];
} catch (e) { }
if (!Array.isArray(eventos)) eventos = [];

// Guarda los eventos en localStorage
const saveEv = () => {
	try {
		localStorage.setItem(KEV, JSON.stringify(eventos));
		marcarCambio(); // programa la subida al Gist
	} catch (e) { }
};

// Guarda el estado en localStorage (si falla, se ignora el error)
const save = () => {
	try {
		localStorage.setItem(KEY, JSON.stringify(st));
		marcarCambio(); // programa la subida al Gist
	} catch (e) { }
};

/* ==========================================================
	3. CONSTANTES Y FUNCIONES AUXILIARES
   ========================================================== */

// Nombres de los días
const D = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

// Horas [inicio, fin] de cada franja (entre la 3ª y la 4ª está el recreo)
const H = [
	["8:00", "9:00"],
	["9:00", "10:00"],
	["10:00", "11:00"],
	["11:30", "12:30"],
	["12:30", "13:30"],
	["13:30", "14:30"]
];

// Fila de la rejilla CSS de cada franja (la fila 5 queda para el recreo)
const row = i => i < 3 ? i + 2 : i + 3;

// Índice del día actual (0 = lunes ... 6 = domingo)
const hoy = (new Date().getDay() + 6) % 7;

// Textos de los tipos de evento
const TIPO = { exam: 'Examen', holiday: 'Festivo' };

// Nombres de los 7 días de la semana (para el aviso)
const DS = [...D, 'Sábado', 'Domingo'];

// Convierte una fecha en texto "AAAA-MM-DD" (hora local)
const ymd = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

// Fechas (AAAA-MM-DD) de una semana, de lunes a domingo: 0 = esta semana, 1 = la próxima
const semanaActual = (desp = 0) => {
	const l = new Date();
	l.setDate(l.getDate() - hoy + 7 * desp); // retrocede hasta el lunes (y avanza las semanas indicadas)
	return Array.from({ length: 7 }, (_, i) => {
		const x = new Date(l);
		x.setDate(l.getDate() + i);
		return ymd(x);
	});
};

// Asignatura de un evento (null si no tiene o ya no existe)
const asigEv = e => (e.s && st.subjects[e.s]) || null;

// Texto completo de un evento: "Asignatura: descripción", o solo lo que haya
const textoEv = e => {
	const m = asigEv(e);
	return (m ? (e.n ? `${m.n}: ${e.n}` : m.n) : e.n) || TIPO[e.t];
};

// Texto corto para la cabecera del día: el código de la asignatura
const cortoEv = e => asigEv(e) ? asigEv(e).c : (e.n || TIPO[e.t]);

// Etiquetas HTML de los eventos de una fecha (se ponen en la cabecera del día)
const etiquetas = f => eventos.filter(e => e.d === f)
	.map(e => `<span class="tag ${e.t}" title="${esc(textoEv(e))}">${esc(cortoEv(e))}</span>`).join('');

// Día que muestra la vista móvil (por defecto hoy; si es fin de semana, el lunes)
let diaMovil = hoy < 5 ? hoy : 0;

// Vista móvil: pestañas de los días y lista vertical de las clases del día elegido
function renderMovil(semana) {
	const d = diaMovil;

	// Pestañas (Lun, Mar...) y título del día con sus etiquetas de evento
	let h = '<div class="mtabs">' + D.map((n, i) =>
		`<button class="mtab${i === d ? ' on' : ''}${i === hoy ? ' hoy' : ''}" data-dia="${i}">${n.slice(0, 3)}</button>`).join('') + '</div>';
	h += `<div class="mday">${D[d]} ${+semana[d].slice(8)}${etiquetas(semana[d])}</div>`;

	// Una fila por cada bloque de clase (las horas seguidas de una materia se unen)
	for (let i = 0; i < 6; i++) {
		if (joined(d, i)) continue;
		const b = block(d, i)[1], id = st.sched[d][i], m = id && st.subjects[id];
		if (i === 3) h += '<div class="mrec">RECREO · 11:00–11:30</div>';
		h += `<div class="cell mcell" data-d="${d}" data-i="${i}" style="--n:${b - i + 1}"><div class="mtime">${H.slice(i, b + 1).map(t => `<div class="mh"><b>${t[0]}</b>${t[1]}</div>`).join('')}</div>` +
			(m
				? `<div class="cls" style="--h:${m.h}"><span class="c">${esc(m.c)}</span><span class="n">${esc(m.n)}</span><span class="t">${esc(m.t)}</span></div>`
				: '<div class="mfree">Libre</div>') +
			'</div>';
	}
	mv.innerHTML = h;
}

// Convierte una hora "H:MM" en minutos desde medianoche
const aMin = s => {
	const [h, m] = s.split(':');
	return +h * 60 + +m;
};

// Marca con un reborde la clase que está en curso ahora mismo (y el recreo cuando toca)
function marcarAhora() {
	// Quita las marcas anteriores
	document.querySelectorAll('.ahora').forEach(x => x.classList.remove('ahora'));

	const ahora = new Date();
	const d = (ahora.getDay() + 6) % 7; // 0 = lunes ... 6 = domingo
	const min = ahora.getHours() * 60 + ahora.getMinutes();
	if (d > 4) return; // fin de semana: no hay clases

	// Recreo (11:00–11:30): en móvil solo se marca si se está viendo el día de hoy
	if (min >= aMin('11:00') && min < aMin('11:30')) {
		document.querySelectorAll('.rec').forEach(x => x.classList.add('ahora'));
		if (diaMovil === d) document.querySelectorAll('.mrec').forEach(x => x.classList.add('ahora'));
		return;
	}

	// Franja horaria actual (si no hay ninguna, es que estamos fuera del horario de clases)
	const i = H.findIndex(t => min >= aMin(t[0]) && min < aMin(t[1]));
	if (i < 0) return;

	// Bloque al que pertenece: si hay horas seguidas, se marca la tarjeta entera
	const a = block(d, i)[0];
	document.querySelectorAll(`.cell[data-d="${d}"][data-i="${a}"] .cls`).forEach(x => x.classList.add('ahora'));
}

// Muestra (u oculta) el aviso con los eventos de esta semana y de la próxima
function avisoSemana(semana) {
	// Eventos de una semana, con el nombre del día: [{ ...evento, dia: "Lunes 12" }]
	const deSemana = fechas => {
		const lista = [];
		fechas.forEach((f, i) => eventos.filter(e => e.d === f).forEach(e => lista.push({ ...e, dia: `${DS[i]} ${+f.slice(8)}` })));
		return lista;
	};

	// Bloque con un título y sus eventos (vacío si no hay ninguno)
	const bloque = (titulo, lista) => lista.length
		? `<b>${titulo}</b>` + lista.map(e => `<div><span class="tag ${e.t}">${TIPO[e.t]}</span> ${e.dia} · ${esc(textoEv(e))}</div>`).join('')
		: '';

	// Esta semana y la próxima; solo se muestran los bloques que tengan algo
	const bloques = [
		bloque('📌 Esta semana tienes:', deSemana(semana)),
		bloque('📅 La próxima semana:', deSemana(semanaActual(1)))
	].filter(Boolean);

	aviso.classList.toggle('vacio', bloques.length === 0); // en pantallas estrechas se oculta si no hay nada
	aviso.innerHTML = bloques.length
		? bloques.map(h => `<div class="aviso-bloque">${h}</div>`).join('')
		: '<div class="sin-avisos">✓ Sin exámenes ni festivos esta semana ni la próxima.</div>';
}

// Escapa caracteres especiales para insertar texto de forma segura en HTML
const esc = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ¿La franja i del día d está unida con la anterior?
// Se une si: no es la primera, no cruza el recreo (i = 3),
// tiene la misma materia que la anterior y no está separada manualmente
const joined = (d, i) => i > 0 && i !== 3 && st.sched[d][i] && st.sched[d][i] === st.sched[d][i - 1] && !st.split[d][i];

// Devuelve [primera, última] franja del bloque al que pertenece la franja i
const block = (d, i) => {
	let a = i, b = i;
	while (joined(d, a)) a--;
	while (b < 5 && joined(d, b + 1)) b++;
	return [a, b];
};

// Indica si estamos en modo edición
let editing = false;

/* ==========================================================
	4. DIBUJAR EL HORARIO
   ========================================================== */
function render() {
	// h = HTML que vamos acumulando; per = nº de periodos; used = materias distintas
	let h = '<div class="dh"></div>', per = 0, used = new Set();

	// Cabeceras de los días (se marca el día actual)
	const semana = semanaActual(); // fechas de lunes a domingo de esta semana
	D.forEach((d, i) => h += `<div class="dh${i === hoy ? ' today' : ''}">${d}${etiquetas(semana[i])}</div>`);

	// Columna de horas y fila del recreo
	H.forEach((t, i) => {
		h += `<div class="time" style="grid-row:${row(i)};grid-column:1"><b>${t[0]}</b>${t[1]}</div>`;
		// Tras la 3ª franja se inserta el recreo
		if (i === 2) h += `<div class="rec" style="grid-row:5"><div class="time"><b>11:00</b>11:30</div><span>RECREO</span></div>`;
	});

	// Celdas de cada día y franja
	D.forEach((_, d) => {
		for (let i = 0; i < 6; i++) {
			// Si está unida con la anterior, ya se dibujó dentro del bloque
			if (joined(d, i)) continue;

			// b = última franja del bloque; id = clave de la materia; m = datos de la materia
			const b = block(d, i)[1], id = st.sched[d][i], m = id && st.subjects[id];

			// Cuenta periodos lectivos y materias distintas
			if (m) {
				per += b - i + 1;
				used.add(id);
			}

			// Celda con "span" para ocupar varias filas si hay horas seguidas
			h += `<div class="cell${d === hoy ? ' col-today' : ''}" data-d="${d}" data-i="${i}" style="grid-row:${row(i)}/span ${b - i + 1};grid-column:${d + 2}">` +
				(m
					? `<div class="cls" style="--h:${m.h}"><span class="c">${esc(m.c)}</span><span class="n">${esc(m.n)}</span><span class="t">${esc(m.t)}</span></div>`
					: '<div class="add">+ Añadir materia</div>') +
				'</div>';
		}
	});

	// Pinta todo en la rejilla y actualiza el subtítulo
	g.innerHTML = h;
	avisoSemana(semana); // avisa si hay exámenes o festivos esta semana
	renderMovil(semana); // actualiza la vista móvil
	marcarAhora(); // marca la clase en curso
	$('eb').textContent = st.setup ? st.setup.inst : '';
	$('bd').textContent = st.setup ? st.setup.curso : '';
	$('bd').hidden = !st.setup;
	const anio = new Date().getFullYear() - (new Date().getMonth() < 6 ? 1 : 0); // curso escolar actual
	sub.textContent = `Curso ${anio}/${String(anio + 1).slice(2)} · ${per} periodos lectivos semanales · ${used.size} materias`;
}

/* ==========================================================
	5. DIÁLOGO DE EDICIÓN
   ========================================================== */

// Atajo para obtener elementos por id y referencias a elementos frecuentes
const $ = id => document.getElementById(id),
	g = $('g'),
	sub = $('sub'),
	dlg = $('dlg'),
	sel = $('sel'),
	aviso = $('aviso'),
	mv = $('mv'),
	dcal = $('dcal');

// Franja que se está editando: { d: día, a: primera franja, b: última franja }
let cur = null;

// Ids de los campos del formulario (código, nombre, profesor, color)
const F = ['fc', 'fn', 'ft', 'fh'];

// Rellena el formulario con los datos de la materia seleccionada
function fill() {
	const v = sel.value, m = st.subjects[v], off = v === '';
	$('fc').value = m ? m.c : '';
	$('fn').value = m ? m.n : '';
	$('ft').value = m ? m.t : '';
	$('fh').value = m ? m.h : Math.floor(Math.random() * 360); // color aleatorio si no hay materia
	// Si la franja queda vacía, se desactivan los campos
	F.forEach(k => $(k).disabled = off);
}

// ¿Hay una franja contigua con la misma materia que esté separada y se pueda unir?
function canMerge() {
	const { d, a, b } = cur, id = st.sched[d][a];
	if (!id) return false;
	return (a > 0 && a !== 3 && st.sched[d][a - 1] === id && st.split[d][a]) ||
		(b < 5 && b + 1 !== 3 && st.sched[d][b + 1] === id && st.split[d][b + 1]);
}

// Clic en una celda: abre el diálogo (solo en modo edición)
g.onclick = e => {
	const c = e.target.closest('.cell');
	if (!editing || !c) return;

	const d = +c.dataset.d, i = +c.dataset.i, [a, b] = block(d, i);
	cur = { d, a, b };

	// Texto descriptivo: día, horas y aviso de que los cambios afectan a toda la materia
	$('dwho').textContent = `${D[d]} · ${H[a][0]}–${H[b][1]}` +
		(b > a ? ` (${b - a + 1} horas juntas)` : '') +
		'. Los cambios en nombre, profesor o color afectan a todas las franjas de esa materia.';

	// Rellena el desplegable: vacío + materias existentes + opción de crear nueva
	sel.innerHTML = '<option value="">— Vacío —</option>' +
		Object.entries(st.subjects).map(([k, m]) => `<option value="${k}">${esc(m.n)}</option>`).join('') +
		'<option value="__new">+ Nueva materia…</option>';

	sel.value = st.sched[d][a] || '';
	fill();

	// Muestra "Separar" si el bloque tiene varias horas, y "Unir" si es posible
	$('sp').hidden = b === a;
	$('un').hidden = !canMerge();

	dlg.showModal();
};

// Al cambiar de materia en el desplegable
sel.onchange = () => {
	if (sel.value === '__new') {
		// Nueva materia: campos vacíos y color aleatorio
		F.forEach(k => $(k).disabled = false);
		$('fc').value = $('fn').value = $('ft').value = '';
		$('fh').value = Math.floor(Math.random() * 360);
		$('fn').focus();
	} else {
		fill();
	}
};

// Vista móvil: cambia de día con las pestañas; el resto de clics (editar) usan el mismo código que la tabla
mv.onclick = e => {
	const t = e.target.closest('.mtab');
	if (t) {
		diaMovil = +t.dataset.dia;
		render();
		return;
	}
	g.onclick(e);
};

// Botón Cancelar
$('no').onclick = () => dlg.close();

// Botón Separar horas: marca las franjas del bloque como separadas
$('sp').onclick = () => {
	for (let j = cur.a + 1; j <= cur.b; j++) st.split[cur.d][j] = true;
	save();
	render();
	dlg.close();
};

// Botón Unir horas: quita la marca de separación con las franjas contiguas
$('un').onclick = () => {
	const { d, a, b } = cur, id = st.sched[d][a];
	if (a > 0 && st.sched[d][a - 1] === id) st.split[d][a] = false;
	if (b < 5 && st.sched[d][b + 1] === id) st.split[d][b + 1] = false;
	save();
	render();
	dlg.close();
};

// Botón Guardar
$('ok').onclick = () => {
	const { d, a, b } = cur, old = st.sched[d][a];
	let v = sel.value;

	if (v !== '') {
		// El nombre es obligatorio
		const n = $('fn').value.trim();
		if (!n) {
			$('fn').focus();
			return;
		}

		// Datos de la materia (si no hay código, usa las 6 primeras letras del nombre)
		const m = {
			c: $('fc').value.trim() || n.slice(0, 6).toUpperCase(),
			n,
			t: $('ft').value.trim(),
			h: +$('fh').value
		};

		// Si es nueva, se le crea una clave única con la fecha actual
		if (v === '__new') v = 'm' + Date.now();
		st.subjects[v] = m;
	} else {
		v = null; // franja vacía
	}

	// Asigna la materia a todas las franjas del bloque
	for (let j = a; j <= b; j++) st.sched[d][j] = v;

	// Al cambiar de materia, las franjas vuelven a fusionarse solas
	if (v !== old) for (let j = a; j <= b + 1 && j < 6; j++) st.split[d][j] = false;

	save();
	render();
	dlg.close();
};

/* ==========================================================
	6. BOTONES DE LA CABECERA
   ========================================================== */

// Botón Editar / Terminar edición
$('edt').onclick = function () {
	editing = !editing;
	g.classList.toggle('edit', editing);
	mv.classList.toggle('edit', editing);
	this.classList.toggle('on', editing);
	this.textContent = editing ? 'Listo' : 'Editar';
	$('rst').hidden = !editing; // "Restablecer" solo se ve en modo edición

	// Mientras se edita se bloquea el resto de botones (solo quedan activos Terminar edición y Restablecer)
	['cal', 'sinc', 'imp'].forEach(id => $(id).disabled = editing);

	// La advertencia solo se ve en modo edición
	$('wedit').hidden = !editing;
	$('acc').classList.toggle('on', editing); // fila Restablecer / Borrar calendario
};

// Botón Restablecer: vuelve al horario original (con confirmación)
$('rst').onclick = () => {
	if (confirm('¿Vaciar el horario? Se conservan tus asignaturas y los exámenes del calendario.')) {
		const v = DEF();
		st.sched = v.sched;
		st.split = v.split;
		save();
		render();
	}
};

/* ==========================================================
	7. CALENDARIO (exámenes y festivos)
   ========================================================== */

// Mes que se muestra en el calendario (siempre el día 1) y día seleccionado
let mes = new Date();
mes.setDate(1);
let selDia = ymd(new Date());

// Dibuja el calendario del mes y la lista de eventos de ese mes
function drawCal() {
	const y = mes.getFullYear(), m = mes.getMonth(), hoyF = ymd(new Date());
	$('mt').textContent = mes.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

	// Iniciales de los días y huecos hasta el primer día del mes
	let h = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(x => `<div class="cw">${x}</div>`).join('');
	h += '<div></div>'.repeat((new Date(y, m, 1).getDay() + 6) % 7);

	// Un cuadro por cada día, con puntos de color si tiene eventos
	for (let i = 1, n = new Date(y, m + 1, 0).getDate(); i <= n; i++) {
		const f = ymd(new Date(y, m, i));
		const puntos = eventos.filter(e => e.d === f).map(e => `<i class="${e.t}"></i>`).join('');
		h += `<div class="cd${f === selDia ? ' sel' : ''}${f === hoyF ? ' hoy' : ''}" data-f="${f}">${i}<span class="dots">${puntos}</span></div>`;
	}
	$('cg').innerHTML = h;

	// Lista de eventos del mes mostrado, ordenados por fecha
	const pref = `${y}-${String(m + 1).padStart(2, '0')}`;
	const lista = eventos.filter(e => e.d.startsWith(pref)).sort((p, q) => p.d.localeCompare(q.d));
	$('evl').innerHTML = lista.length
		? lista.map(e => `<div class="ev"><span><span class="tag ${e.t}">${TIPO[e.t]}</span> ${+e.d.slice(8)} · ${esc(textoEv(e))}</span><button data-id="${e.id}" title="Borrar">✕</button></div>`).join('')
		: '<div class="vacio">Nada apuntado este mes.</div>';
}

// Rellena el desplegable de asignaturas (solo se muestra para exámenes)
function llenarAsignaturas() {
	$('em').innerHTML = '<option value="">— Sin asignatura —</option>' +
		Object.entries(st.subjects).map(([k, m]) => `<option value="${k}">${esc(m.n)}</option>`).join('');
	$('wmat').hidden = $('et').value !== 'exam';
}

// Al cambiar el tipo, se muestra u oculta el selector de asignatura
$('et').onchange = () => $('wmat').hidden = $('et').value !== 'exam';

// Botón Calendario: abre el diálogo
$('cal').onclick = () => {
	$('ed').value = selDia;
	drawCal();
	llenarAsignaturas(); // actualiza la lista de asignaturas
	dcal.showModal();
};

// Botón Cerrar
$('ca').onclick = () => dcal.close();

// Flechas para cambiar de mes
$('mp').onclick = () => { mes.setMonth(mes.getMonth() - 1); drawCal(); };
$('mn').onclick = () => { mes.setMonth(mes.getMonth() + 1); drawCal(); };

// Clic en un día: lo selecciona y lo copia al campo de fecha
$('cg').onclick = e => {
	const c = e.target.closest('.cd');
	if (!c) return;
	selDia = c.dataset.f;
	$('ed').value = selDia;
	drawCal();
};

// Si se escribe una fecha a mano, el calendario salta a ese mes
$('ed').onchange = () => {
	if (!$('ed').value) return;
	selDia = $('ed').value;
	mes = new Date(selDia + 'T00:00');
	mes.setDate(1);
	drawCal();
};

// Botón Añadir: apunta un examen o un festivo
$('ea').onclick = () => {
	const d = $('ed').value, t = $('et').value;
	if (!d) { $('ed').focus(); return; }
	const s = t === 'exam' ? $('em').value : ''; // asignatura (solo para exámenes)
	const n = $('en').value.trim() || (s ? '' : TIPO[t]); // sin descripción: con asignatura queda vacío; sin ella, el tipo
	eventos.push({ id: 'e' + Date.now(), d, t, n, s });
	saveEv();
	$('en').value = '';
	render();   // actualiza etiquetas y aviso de la semana
	drawCal();
};

// Botón ✕ de la lista: borra un evento
$('evl').onclick = e => {
	const x = e.target.closest('button[data-id]');
	if (!x) return;
	eventos = eventos.filter(v => v.id !== x.dataset.id);
	saveEv();
	render();
	drawCal();
};

/* ==========================================================
	8. SINCRONIZACIÓN (Gist de GitHub)
   ========================================================== */

// Claves de localStorage: credenciales del Gist y fecha de la última modificación local
const KSYNC = 'horario2dam-sync', KMOD = 'horario2dam-mod';

// Credenciales { id, token } (null si no hay sincronización configurada)
let cred = null;
try {
	cred = JSON.parse(localStorage.getItem(KSYNC));
} catch (e) { }

// true mientras se aplican datos descargados (para no volver a subirlos)
let aplicandoRemoto = false;

// Lee y guarda la fecha (en ms) de la última modificación local
const modLocal = () => {
	try { return +localStorage.getItem(KMOD) || 0; } catch (e) { return 0; }
};
const setMod = n => {
	try { localStorage.setItem(KMOD, String(n)); } catch (e) { }
};

const API = 'https://api.github.com/gists/';
const dsinc = $('dsinc');

// Cabeceras de las peticiones a la API de GitHub
const cab = () => ({ Authorization: 'Bearer ' + cred.token, Accept: 'application/vnd.github+json' });

// Convierte un error HTTP en un mensaje claro
const errHttp = r => new Error(
	r.status === 401 ? 'Token no válido o caducado'
		: r.status === 403 ? 'Sin permiso (¿el token tiene marcada la casilla gist?)'
			: r.status === 404 ? 'No se encuentra el Gist (revisa el ID y el token)'
				: 'Error ' + r.status
);

// Muestra el estado en el diálogo y en el botón de la cabecera
function estado(msg, error) {
	$('sst').textContent = msg;
	$('vst').textContent = msg; // también en la pantalla de configuración inicial
	$('sinc').textContent = !cred ? 'Sincronizar' : error ? 'Sincronizar ⚠' : 'Sincronizar ✓';
}

// Descarga los datos guardados en el Gist
async function bajar() {
	const r = await fetch(API + cred.id, { headers: cab(), cache: 'no-store' });
	if (!r.ok) throw errHttp(r);
	const f = (await r.json()).files['datos.json'];
	if (!f) throw new Error('El Gist no tiene el archivo datos.json');
	const txt = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
	return JSON.parse(txt || '{}');
}

// Sube al Gist el horario, las materias y los eventos del calendario
async function subir() {
	let mod = modLocal();
	if (!mod) { mod = Date.now(); setMod(mod); }
	const r = await fetch(API + cred.id, {
		method: 'PATCH',
		headers: { ...cab(), 'Content-Type': 'application/json' },
		body: JSON.stringify({ files: { 'datos.json': { content: JSON.stringify({ mod, st, eventos }) } } })
	});
	if (!r.ok) throw errHttp(r);
}

// Compara el Gist con los datos locales y se queda con lo más reciente
async function sincronizar() {
	if (!cred) return;
	estado('Sincronizando…');
	try {
		const r = await bajar(), local = modLocal();
		if (!r.mod) {
			// Gist vacío: se suben los datos de este dispositivo
			await subir();
			estado('Datos subidos al Gist.');
		} else if (r.mod > local && r.st && r.st.sched && r.st.split) {
			// El Gist es más reciente: se aplican sus datos aquí
			aplicandoRemoto = true;
			st = r.st;
			if (!st.setup) st.setup = conAsignaturas(st) ? { ...ANTIGUO } : null; // Gist antiguo: sin instituto guardado
			eventos = Array.isArray(r.eventos) ? r.eventos : [];
			save();
			saveEv();
			aplicandoRemoto = false;
			setMod(r.mod);
			render();
			if (dcal.open) { llenarAsignaturas(); drawCal(); }
			if (st.setup) $('conf').hidden = true; // ya hay datos: no hace falta la configuración inicial
			else if (!$('conf').hidden) abrirSetup();
			estado('Datos cargados desde el Gist.');
		} else if (local > r.mod) {
			// Los datos de este dispositivo son más recientes
			await subir();
			estado('Datos subidos al Gist.');
		} else {
			estado('Todo está al día.');
		}
	} catch (e) {
		aplicandoRemoto = false;
		estado(e instanceof TypeError ? 'No se pudo conectar con GitHub (¿sin internet o bloqueado por la red?)' : e.message, true);
	}
}

// Subida automática: espera 1,5 s tras el último cambio para no enviar cada pulsación
let temporizador = null;
function programarSubida() {
	if (!cred) return;
	clearTimeout(temporizador);
	temporizador = setTimeout(async () => {
		try {
			await subir();
			estado('Guardado en el Gist.');
		} catch (e) {
			estado(e instanceof TypeError ? 'No se pudo conectar con GitHub' : e.message, true);
		}
	}, 1500);
}

// Se llama desde save() y saveEv() cada vez que cambia algo
function marcarCambio() {
	if (aplicandoRemoto) return;
	setMod(Date.now());
	programarSubida();
}

// Botón Sincronizar: abre el diálogo
$('sinc').onclick = () => {
	$('sid').value = cred ? cred.id : '';
	$('stk').value = '';
	$('stk').placeholder = cred ? '(guardado en este dispositivo)' : 'Pega aquí tu token';
	$('sdes').hidden = !cred;
	dsinc.showModal();
};

// Botón Cerrar
$('scl').onclick = () => dsinc.close();

// Botón Conectar: guarda las credenciales en este dispositivo y sincroniza
$('sok').onclick = () => {
	const id = $('sid').value.trim().split('/').pop(); // admite pegar la dirección completa
	const token = $('stk').value.trim() || (cred && cred.token);
	if (!id || !token) { estado('Faltan el ID o el token.', true); return; }
	cred = { id, token };
	try { localStorage.setItem(KSYNC, JSON.stringify(cred)); } catch (e) { }
	$('sdes').hidden = false;
	sincronizar();
};

// Botón Desconectar: borra las credenciales de este dispositivo (los datos se conservan)
$('sdes').onclick = () => {
	cred = null;
	try { localStorage.removeItem(KSYNC); } catch (e) { }
	$('sdes').hidden = true;
	$('sid').value = '';
	$('stk').value = '';
	estado('Desconectado. Los datos siguen guardados en este dispositivo.');
};

// Al volver a la pestaña se comprueba si hay cambios hechos en otro dispositivo
document.addEventListener('visibilitychange', () => {
	if (!document.hidden && cred) sincronizar();
});

// Al abrir la página
estado(cred ? 'Conectado.' : 'Sin conectar.');
if (cred) sincronizar();

/* ==========================================================
	9. TEMA CLARO / OSCURO
   ========================================================== */
const root = document.documentElement, b = $('tema');

// ¿Está activo el tema oscuro? (forzado a mano o por preferencia del sistema)
const dark = () => root.dataset.theme === 'dark' || (!root.dataset.theme && matchMedia('(prefers-color-scheme:dark)').matches);

// Actualiza el texto del botón según el tema actual
const sync = () => b.textContent = dark() ? 'Modo claro' : 'Modo oscuro';

// Al pulsar, alterna entre claro y oscuro
b.onclick = () => {
	root.dataset.theme = dark() ? 'light' : 'dark';
	sync();
};

/* ==========================================================
	11. CONFIGURACIÓN INICIAL (instituto, curso y asignaturas)
   ========================================================== */
const conf = $('conf'), crows = $('crows');

// Asignaturas que se están escribiendo en el formulario
let filas = [];

// Dibuja una fila de campos por asignatura (la primera enseña un ejemplo)
function dibujarFilas() {
	crows.textContent = '';
	filas.forEach((r, k) => {
		const d = document.createElement('div');
		d.className = 'srow';
		[['c', 'Abreviatura', 'Ej.: LEN'], ['n', 'Nombre de la asignatura', 'Ej.: Lengua y Literatura'], ['t', 'Profesor/a', 'Ej.: Ana Pérez']].forEach(([f, ph, ej]) => {
			const x = document.createElement('input');
			x.placeholder = k === 0 ? ej : ph;
			x.value = r[f] || '';
			x.setAttribute('aria-label', ph);
			x.oninput = () => { r[f] = x.value; };
			d.appendChild(x);
		});
		const del = document.createElement('button');
		del.type = 'button';
		del.textContent = '✕';
		del.setAttribute('aria-label', 'Quitar asignatura');
		del.onclick = () => {
			filas.splice(k, 1);
			if (!filas.length) filas.push({ c: '', n: '', t: '', h: 10 });
			dibujarFilas();
		};
		d.appendChild(del);
		crows.appendChild(d);
	});
}

// Abre la configuración (obligatoria la primera vez)
function abrirSetup() {
	const primera = !st.setup;
	// Horarios antiguos (con asignaturas pero sin instituto): se conservan sus asignaturas y solo se piden instituto y curso
	const hayDatos = Object.keys(st.subjects).length > 0;
	const ini = st.setup || (hayDatos ? { inst: '', curso: '' } : { inst: '', curso: '' });
	filas = Object.entries(st.subjects).map(([id, m]) => ({ id, ...m }));
	if (!filas.length) filas.push({ c: '', n: '', t: '', h: 10 });
	$('ci').value = ini.inst;
	$('cc').value = ini.curso;
	$('ccan').hidden = primera;                       // la primera vez no se puede cancelar
	$('cok').textContent = primera ? 'Crear horario' : 'Guardar cambios';
	$('vinc').hidden = $('vo').hidden = !primera;     // vincular un calendario existente: solo al crear
	$('cerr').textContent = '';
	dibujarFilas();
	conf.hidden = false;
	$('ci').focus();
}

$('cadd').onclick = () => {
	filas.push({ c: '', n: '', t: '', h: (filas.length * 47 + 10) % 360 });
	dibujarFilas();
	crows.lastChild.querySelector('input').focus();
};
$('ccan').onclick = () => { conf.hidden = true; };

// Botón Crear horario / Guardar cambios
$('cok').onclick = () => {
	const inst = $('ci').value.trim(), curso = $('cc').value.trim(), ok = filas.filter(r => (r.n || '').trim());
	if (!inst || !curso || !ok.length) {
		$('cerr').textContent = !inst ? 'Introduce el nombre de tu instituto.' : !curso ? 'Introduce tu curso.' : 'Añade al menos una asignatura con nombre.';
		return;
	}
	const primera = !st.setup, subj = {};
	ok.forEach((r, k) => {
		const n = r.n.trim();
		subj[r.id || 's' + Date.now() + '_' + k] = { c: (r.c || '').trim() || n.slice(0, 6).toUpperCase(), n, t: (r.t || '').trim(), h: r.h };
	});
	// Las asignaturas quitadas desaparecen también de las franjas donde estaban
	st.sched.forEach(day => day.forEach((v, j) => { if (v && !subj[v]) day[j] = null; }));
	st.subjects = subj;
	st.setup = { inst, curso };
	save();
	conf.hidden = true;
	render();
	if (primera && !editing) $('edt').click(); // empieza en modo edición para colocar las clases
};

// Botón Vincular calendario existente: conecta con el Gist y carga sus datos
$('vbt').onclick = async () => {
	const id = $('vid').value.trim().split('/').pop(), token = $('vtk').value.trim();
	if (!id || !token) { estado('Faltan el ID o el token.', true); return; }
	cred = { id, token };
	try { localStorage.setItem(KSYNC, JSON.stringify(cred)); } catch (e) { }
	await sincronizar();
	if (st.setup) return; // se cargó un calendario completo: la configuración se cierra sola
	if ($('sinc').textContent.includes('⚠')) {
		// Falló: no se guardan credenciales erróneas
		const msg = $('vst').textContent;
		cred = null;
		try { localStorage.removeItem(KSYNC); } catch (e) { }
		estado(msg, false);
	} else {
		estado('Vinculado. El Gist aún no tiene un horario: créalo aquí abajo y se guardará allí.');
	}
};

/* ==========================================================
	12. BORRAR EL CALENDARIO (pide escribir el nombre del centro)
   ========================================================== */
const dbor = $('dbor');

// Compara nombres sin fijarse en mayúsculas ni en espacios repetidos
const norm = x => x.trim().replace(/\s+/g, ' ').toLowerCase();

// ¿Coincide lo escrito con el nombre del centro?
const nombreOk = () => !!st.setup && norm($('bin').value) !== '' && norm($('bin').value) === norm(st.setup.inst);

$('bor').onclick = () => {
	$('bnom').textContent = st.setup ? st.setup.inst : '';
	$('bin').value = '';
	$('bok').disabled = true;
	dbor.showModal();
	$('bin').focus();
};
$('bin').oninput = () => { $('bok').disabled = !nombreOk(); };
$('bcan').onclick = () => dbor.close();

$('bok').onclick = () => {
	if (!nombreOk()) return;
	clearTimeout(temporizador); // cancela cualquier subida pendiente al Gist
	[KEY, KEV, KSYNC, KMOD].forEach(k => { try { localStorage.removeItem(k); } catch (e) { } });
	cred = null;
	eventos = [];
	st = DEF();
	estado('Sin conectar.');
	dbor.close();
	if (editing) $('edt').click(); // sale del modo edición
	render();
	abrirSetup();                  // vuelve a la configuración inicial
};

/* ==========================================================
	10. INICIO
   ========================================================== */
sync();    // ajusta el texto del botón de tema
render();  // dibuja el horario por primera vez
if (!st.setup) abrirSetup(); // persona nueva: la configuración es obligatoria

// La marca de "ahora" se actualiza cada 30 segundos y al volver a la pestaña
setInterval(marcarAhora, 30000);
document.addEventListener('visibilitychange', () => {
	if (!document.hidden) marcarAhora();
});
