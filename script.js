/* ==========================================================
   1. DATOS
   ========================================================== */

// Claves de localStorage: K1 = versión antigua, KEY = versión actual
const K1 = 'horario2dam-v1', KEY = 'horario2dam-v2';

// Catálogo de materias. Cada una tiene:
// c = código, n = nombre, t = profesor/a, h = tono de color (0-359)
const SUB = {
	ING:  { c: "ING-PRO", n: "Inglés profesional", t: "Profesor/a de Inglés", h: 350 },
	ITE:  { c: "ITE-II", n: "Itinerario personal para la empleabilidad II", t: "Beatriz González", h: 215 },
	DI:   { c: "DI", n: "Desarrollo de Interfaces", t: "Daniel Toro", h: 10 },
	SGE:  { c: "SGE", n: "Sistemas de Gestión Empresarial", t: "Francisco Yuste", h: 65 },
	PMDM: { c: "PMDM", n: "Programación Multimedia y Dispositivos Móviles", t: "Daniel Toro", h: 255 },
	AD:   { c: "AD", n: "Acceso a Datos", t: "Patricia Pazos", h: 290 },
	PSP:  { c: "PSP", n: "Programación de Servicios y Procesos", t: "Juan Sevillano", h: 170 },
	OPT:  { c: "OPT_PY", n: "Optativa: Introducción a Python", t: "Juan Sevillano", h: 45 },
	PROY: { c: "PROY", n: "Proyecto Intermodular", t: "Patricia Pazos", h: 35 }
};

// Crea un estado nuevo a partir de un horario:
// - subjects: copia independiente del catálogo
// - sched: matriz [día][franja] con la clave de la materia
// - split: matriz [día][franja] que indica si esa franja está "separada" de la anterior
const mk = sched => ({
	subjects: JSON.parse(JSON.stringify(SUB)),
	sched,
	split: sched.map(() => Array(6).fill(false))
});

// Horario por defecto: 5 días (L-V) x 6 franjas horarias
const DEF = () => mk([
	["ING", "DI", "SGE", "AD", "PSP", "PSP"],      // Lunes
	["ITE", "PMDM", "AD", "OPT", "PROY", "DI"],    // Martes
	["PMDM", "AD", "OPT", "SGE", "PMDM", "ITE"],     // Miércoles
	["SGE", "PSP", "AD", "ING", "DI", "DI"],       // Jueves
	["SGE", "DI", "DI", "OPT", "ITE", "PROY"]    // Viernes
]);

/* ==========================================================
   2. CARGA DEL ESTADO (localStorage)
   ========================================================== */

// "st" es el estado actual de la aplicación
let st;

// Intenta leer lo guardado previamente
try {
	st = JSON.parse(localStorage.getItem(KEY));
} catch (e) { }

// Si no hay datos válidos, se usa el horario por defecto
if (!st || !st.sched || !st.split) {
	st = DEF();

	// Migración: recupera los cambios guardados con la versión anterior
	try {
		const o = JSON.parse(localStorage.getItem(K1));
		if (o && o.subjects && o.sched) {
			st.subjects = o.subjects;
			// En la versión antigua, las celdas vacías heredaban la materia anterior
			st.sched = o.sched.map(day => {
				let p = null;
				return day.map(c => {
					p = c ? c[0] : p;
					return p;
				});
			});
		}
	} catch (e) { }
}

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

// Fechas (AAAA-MM-DD) de la semana actual: de lunes a domingo
const semanaActual = () => {
	const l = new Date();
	l.setDate(l.getDate() - hoy); // retrocede hasta el lunes
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
		h += `<div class="cell mcell" data-d="${d}" data-i="${i}"><div class="mtime"><b>${H[i][0]}</b>${H[b][1]}</div>` +
			(m
				? `<div class="cls" style="--h:${m.h}"><span class="c">${esc(m.c)}</span><span class="n">${esc(m.n)}</span><span class="t">${esc(m.t)}</span></div>`
				: '<div class="mfree">Libre</div>') +
			'</div>';
	}
	mv.innerHTML = h;
}

// Muestra (u oculta) el aviso con los eventos de la semana actual
function avisoSemana(semana) {
	const lista = [];
	semana.forEach((f, i) => eventos.filter(e => e.d === f).forEach(e => lista.push({ ...e, dia: `${DS[i]} ${+f.slice(8)}` })));
	aviso.hidden = lista.length === 0;
	aviso.innerHTML = lista.length
		? '<b>📌 Esta semana tienes:</b>' + lista.map(e => `<div><span class="tag ${e.t}">${TIPO[e.t]}</span> ${e.dia} · ${esc(textoEv(e))}</div>`).join('')
		: '';
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
	sub.textContent = `Curso 2026/27 · ${per} periodos lectivos semanales · ${used.size} materias`;
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
	this.textContent = editing ? 'Terminar edición' : 'Editar';
	$('rst').hidden = !editing; // "Restablecer" solo se ve en modo edición

	// Mientras se edita se bloquea el resto de botones (solo quedan activos Terminar edición y Restablecer)
	['cal', 'sinc', 'imp'].forEach(id => $(id).disabled = editing);

	// La advertencia solo se ve en modo edición
	$('wedit').hidden = !editing;
};

// Botón Restablecer: vuelve al horario original (con confirmación)
$('rst').onclick = () => {
	if (confirm('¿Volver al horario original?')) {
		st = DEF();
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
			eventos = Array.isArray(r.eventos) ? r.eventos : [];
			save();
			saveEv();
			aplicandoRemoto = false;
			setMod(r.mod);
			render();
			if (dcal.open) { llenarAsignaturas(); drawCal(); }
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
   10. INICIO
   ========================================================== */
sync();    // ajusta el texto del botón de tema
render();  // dibuja el horario por primera vez
