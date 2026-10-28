//#region ../banner-artwork-release-20261027/node_modules/.pnpm/@vue+shared@3.5.41/node_modules/@vue/shared/dist/shared.esm-bundler.js
// @__NO_SIDE_EFFECTS__
function e(e) {
	let t = /* @__PURE__ */ Object.create(null);
	for (let n of e.split(",")) t[n] = 1;
	return (e) => e in t;
}
var t = {}, n = [], r = () => {}, i = () => !1, a = (e) => e.charCodeAt(0) === 111 && e.charCodeAt(1) === 110 && (e.charCodeAt(2) > 122 || e.charCodeAt(2) < 97), o = (e) => e.startsWith("onUpdate:"), s = Object.assign, c = (e, t) => {
	let n = e.indexOf(t);
	n > -1 && e.splice(n, 1);
}, l = Object.prototype.hasOwnProperty, u = (e, t) => l.call(e, t), d = Array.isArray, f = (e) => x(e) === "[object Map]", p = (e) => x(e) === "[object Set]", m = (e) => x(e) === "[object Date]", h = (e) => typeof e == "function", g = (e) => typeof e == "string", _ = (e) => typeof e == "symbol", v = (e) => typeof e == "object" && !!e, y = (e) => (v(e) || h(e)) && h(e.then) && h(e.catch), b = Object.prototype.toString, x = (e) => b.call(e), S = (e) => x(e).slice(8, -1), C = (e) => x(e) === "[object Object]", w = (e) => g(e) && e !== "NaN" && e[0] !== "-" && "" + parseInt(e, 10) === e, T = /* @__PURE__ */ e(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"), ee = (e) => {
	let t = /* @__PURE__ */ Object.create(null);
	return ((n) => t[n] || (t[n] = e(n)));
}, E = /-\w/g, D = ee((e) => e.replace(E, (e) => e.slice(1).toUpperCase())), te = /\B([A-Z])/g, ne = ee((e) => e.replace(te, "-$1").toLowerCase()), re = ee((e) => e.charAt(0).toUpperCase() + e.slice(1)), ie = ee((e) => e ? `on${re(e)}` : ""), O = (e, t) => !Object.is(e, t), ae = (e, ...t) => {
	for (let n = 0; n < e.length; n++) e[n](...t);
}, oe = (e, t, n, r = !1) => {
	Object.defineProperty(e, t, {
		configurable: !0,
		enumerable: !1,
		writable: r,
		value: n
	});
}, k = (e) => {
	let t = parseFloat(e);
	return isNaN(t) ? e : t;
}, se, ce = () => se ||= typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : typeof window < "u" ? window : typeof global < "u" ? global : {};
function le(e) {
	if (d(e)) {
		let t = {};
		for (let n = 0; n < e.length; n++) {
			let r = e[n], i = g(r) ? pe(r) : le(r);
			if (i) for (let e in i) t[e] = i[e];
		}
		return t;
	}
	if (g(e) || v(e)) return e;
}
var ue = /;(?![^(]*\))/g, de = /:([^]+)/, fe = /\/\*[^]*?\*\//g;
function pe(e) {
	let t = {};
	return e.replace(fe, "").split(ue).forEach((e) => {
		if (e) {
			let n = e.split(de);
			n.length > 1 && (t[n[0].trim()] = n[1].trim());
		}
	}), t;
}
function A(e) {
	let t = "";
	if (g(e)) t = e;
	else if (d(e)) for (let n = 0; n < e.length; n++) {
		let r = A(e[n]);
		r && (t += r + " ");
	}
	else if (v(e)) for (let n in e) e[n] && (t += n + " ");
	return t.trim();
}
function j(e) {
	if (!e) return null;
	let { class: t, style: n } = e;
	return t && !g(t) && (e.class = A(t)), n && (e.style = le(n)), e;
}
var me = "itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly", he = /* @__PURE__ */ e(me);
me + "";
function ge(e) {
	return !!e || e === "";
}
function _e(e, t) {
	if (e.length !== t.length) return !1;
	let n = !0;
	for (let r = 0; n && r < e.length; r++) n = ve(e[r], t[r]);
	return n;
}
function ve(e, t) {
	if (e === t) return !0;
	let n = m(e), r = m(t);
	if (n || r) return n && r ? e.getTime() === t.getTime() : !1;
	if (n = _(e), r = _(t), n || r) return e === t;
	if (n = d(e), r = d(t), n || r) return n && r ? _e(e, t) : !1;
	if (n = v(e), r = v(t), n || r) {
		if (!n || !r || Object.keys(e).length !== Object.keys(t).length) return !1;
		for (let n in e) {
			let r = e.hasOwnProperty(n), i = t.hasOwnProperty(n);
			if (r && !i || !r && i || !ve(e[n], t[n])) return !1;
		}
	}
	return String(e) === String(t);
}
var ye = (e) => !!(e && e.__v_isRef === !0), M = (e) => g(e) ? e : e == null ? "" : d(e) || v(e) && (e.toString === b || !h(e.toString)) ? ye(e) ? M(e.value) : JSON.stringify(e, be, 2) : String(e), be = (e, t) => ye(t) ? be(e, t.value) : f(t) ? { [`Map(${t.size})`]: [...t.entries()].reduce((e, [t, n], r) => (e[xe(t, r) + " =>"] = n, e), {}) } : p(t) ? { [`Set(${t.size})`]: [...t.values()].map((e) => xe(e)) } : _(t) ? xe(t) : v(t) && !d(t) && !C(t) ? String(t) : t, xe = (e, t = "") => _(e) ? `Symbol(${e.description ?? t})` : e, Se, Ce = class {
	constructor(e = !1) {
		this.detached = e, this._active = !0, this._on = 0, this.effects = [], this.cleanups = [], this._isPaused = !1, this._warnOnRun = !0, this.__v_skip = !0, !e && Se && (Se.active ? (this.parent = Se, this.index = (Se.scopes || (Se.scopes = [])).push(this) - 1) : (this._active = !1, this._warnOnRun = !1));
	}
	get active() {
		return this._active;
	}
	pause() {
		if (this._active) {
			this._isPaused = !0;
			let e, t;
			if (this.scopes) {
				let n = this.scopes.slice();
				for (e = 0, t = n.length; e < t; e++) n[e].pause();
			}
			for (e = 0, t = this.effects.length; e < t; e++) this.effects[e].pause();
		}
	}
	resume() {
		if (this._active && this._isPaused) {
			this._isPaused = !1;
			let e, t;
			if (this.scopes) {
				let n = this.scopes.slice();
				for (e = 0, t = n.length; e < t; e++) n[e].resume();
			}
			let n = this.effects.slice();
			for (e = 0, t = n.length; e < t; e++) n[e].resume();
		}
	}
	run(e) {
		if (this._active) {
			let t = Se;
			try {
				return Se = this, e();
			} finally {
				Se = t;
			}
		}
	}
	on() {
		++this._on === 1 && (this.prevScope = Se, Se = this);
	}
	off() {
		if (this._on > 0 && --this._on === 0) {
			if (Se === this) Se = this.prevScope;
			else {
				let e = Se;
				for (; e;) {
					if (e.prevScope === this) {
						e.prevScope = this.prevScope;
						break;
					}
					e = e.prevScope;
				}
			}
			this.prevScope = void 0;
		}
	}
	stop(e) {
		if (this._active) {
			this._active = !1;
			let t, n;
			for (t = 0, n = this.effects.length; t < n; t++) this.effects[t].stop();
			for (this.effects.length = 0, t = 0, n = this.cleanups.length; t < n; t++) this.cleanups[t]();
			if (this.cleanups.length = 0, this.scopes) {
				let e = this.scopes.slice();
				for (t = 0, n = e.length; t < n; t++) e[t].stop(!0);
				this.scopes.length = 0;
			}
			if (!this.detached && this.parent && !e) {
				let e = this.parent.scopes.pop();
				e && e !== this && (this.parent.scopes[this.index] = e, e.index = this.index);
			}
			this.parent = void 0;
		}
	}
};
function we(e) {
	return new Ce(e);
}
function Te() {
	return Se;
}
function Ee(e, t = !1) {
	Se && Se.cleanups.push(e);
}
var N, De = /* @__PURE__ */ new WeakSet(), Oe = class {
	constructor(e) {
		this.fn = e, this.deps = void 0, this.depsTail = void 0, this.flags = 5, this.next = void 0, this.cleanup = void 0, this.scheduler = void 0, Se && (Se.active ? Se.effects.push(this) : this.flags &= -2);
	}
	pause() {
		this.flags |= 64;
	}
	resume() {
		this.flags & 64 && (this.flags &= -65, De.has(this) && (De.delete(this), this.trigger()));
	}
	notify() {
		this.flags & 2 && !(this.flags & 32) || this.flags & 8 || Me(this);
	}
	run() {
		if (!(this.flags & 1)) return this.fn();
		this.flags |= 2, Ge(this), Fe(this);
		let e = N, t = Ve;
		N = this, Ve = !0;
		try {
			return this.fn();
		} finally {
			Ie(this), N = e, Ve = t, this.flags &= -3;
		}
	}
	stop() {
		if (this.flags & 1) {
			for (let e = this.deps; e; e = e.nextDep) ze(e);
			this.deps = this.depsTail = void 0, Ge(this), this.onStop && this.onStop(), this.flags &= -2;
		}
	}
	trigger() {
		this.flags & 64 ? De.add(this) : this.scheduler ? this.scheduler() : this.runIfDirty();
	}
	runIfDirty() {
		Le(this) && this.run();
	}
	get dirty() {
		return Le(this);
	}
}, ke = 0, Ae, je;
function Me(e, t = !1) {
	if (e.flags |= 8, t) {
		e.next = je, je = e;
		return;
	}
	e.next = Ae, Ae = e;
}
function Ne() {
	ke++;
}
function Pe() {
	if (--ke > 0) return;
	if (je) {
		let e = je;
		for (je = void 0; e;) {
			let t = e.next;
			e.next = void 0, e.flags &= -9, e = t;
		}
	}
	let e;
	for (; Ae;) {
		let t = Ae;
		for (Ae = void 0; t;) {
			let n = t.next;
			if (t.next = void 0, t.flags &= -9, t.flags & 1) try {
				t.trigger();
			} catch (t) {
				e ||= t;
			}
			t = n;
		}
	}
	if (e) throw e;
}
function Fe(e) {
	for (let t = e.deps; t; t = t.nextDep) t.version = -1, t.prevActiveLink = t.dep.activeLink, t.dep.activeLink = t;
}
function Ie(e) {
	let t, n = e.depsTail, r = n;
	for (; r;) {
		let e = r.prevDep;
		r.version === -1 ? (r === n && (n = e), ze(r), Be(r)) : t = r, r.dep.activeLink = r.prevActiveLink, r.prevActiveLink = void 0, r = e;
	}
	e.deps = t, e.depsTail = n;
}
function Le(e) {
	for (let t = e.deps; t; t = t.nextDep) if (t.dep.version !== t.version || t.dep.computed && (Re(t.dep.computed) || t.dep.version !== t.version)) return !0;
	return !!e._dirty;
}
function Re(e) {
	if (e.flags & 4 && !(e.flags & 16) || (e.flags &= -17, e.globalVersion === Ke) || (e.globalVersion = Ke, !e.isSSR && e.flags & 128 && (!e.deps && !e._dirty || !Le(e)))) return;
	e.flags |= 2;
	let t = e.dep, n = N, r = Ve;
	N = e, Ve = !0;
	try {
		Fe(e);
		let n = e.fn(e._value);
		(t.version === 0 || O(n, e._value)) && (e.flags |= 128, e._value = n, t.version++);
	} catch (e) {
		throw t.version++, e;
	} finally {
		N = n, Ve = r, Ie(e), e.flags &= -3;
	}
}
function ze(e, t = !1) {
	let { dep: n, prevSub: r, nextSub: i } = e;
	if (r && (r.nextSub = i, e.prevSub = void 0), i && (i.prevSub = r, e.nextSub = void 0), n.subs === e && (n.subs = r, !r && n.computed)) {
		n.computed.flags &= -5;
		for (let e = n.computed.deps; e; e = e.nextDep) ze(e, !0);
	}
	!t && !--n.sc && n.map && n.map.delete(n.key);
}
function Be(e) {
	let { prevDep: t, nextDep: n } = e;
	t && (t.nextDep = n, e.prevDep = void 0), n && (n.prevDep = t, e.nextDep = void 0);
}
var Ve = !0, He = [];
function Ue() {
	He.push(Ve), Ve = !1;
}
function We() {
	let e = He.pop();
	Ve = e === void 0 || e;
}
function Ge(e) {
	let { cleanup: t } = e;
	if (e.cleanup = void 0, t) {
		let e = N;
		N = void 0;
		try {
			t();
		} finally {
			N = e;
		}
	}
}
var Ke = 0, qe = class {
	constructor(e, t) {
		this.sub = e, this.dep = t, this.version = t.version, this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = void 0;
	}
}, Je = class {
	constructor(e) {
		this.computed = e, this.version = 0, this.activeLink = void 0, this.subs = void 0, this.map = void 0, this.key = void 0, this.sc = 0, this.__v_skip = !0;
	}
	track(e) {
		if (!N || !Ve || N === this.computed) return;
		let t = this.activeLink;
		if (t === void 0 || t.sub !== N) t = this.activeLink = new qe(N, this), N.deps ? (t.prevDep = N.depsTail, N.depsTail.nextDep = t, N.depsTail = t) : N.deps = N.depsTail = t, Ye(t);
		else if (t.version === -1 && (t.version = this.version, t.nextDep)) {
			let e = t.nextDep;
			e.prevDep = t.prevDep, t.prevDep && (t.prevDep.nextDep = e), t.prevDep = N.depsTail, t.nextDep = void 0, N.depsTail.nextDep = t, N.depsTail = t, N.deps === t && (N.deps = e);
		}
		return t;
	}
	trigger(e) {
		this.version++, Ke++, this.notify(e);
	}
	notify(e) {
		Ne();
		try {
			for (let e = this.subs; e; e = e.prevSub) e.sub.notify() && e.sub.dep.notify();
		} finally {
			Pe();
		}
	}
};
function Ye(e) {
	if (e.dep.sc++, e.sub.flags & 4) {
		let t = e.dep.computed;
		if (t && !e.dep.subs) {
			t.flags |= 20;
			for (let e = t.deps; e; e = e.nextDep) Ye(e);
		}
		let n = e.dep.subs;
		n !== e && (e.prevSub = n, n && (n.nextSub = e)), e.dep.subs = e;
	}
}
var Xe = /* @__PURE__ */ new WeakMap(), Ze = /* @__PURE__ */ Symbol(""), Qe = /* @__PURE__ */ Symbol(""), $e = /* @__PURE__ */ Symbol("");
function et(e, t, n) {
	if (Ve && N) {
		let t = Xe.get(e);
		t || Xe.set(e, t = /* @__PURE__ */ new Map());
		let r = t.get(n);
		r || (t.set(n, r = new Je()), r.map = t, r.key = n), r.track();
	}
}
function tt(e, t, n, r, i, a) {
	let o = Xe.get(e);
	if (!o) {
		Ke++;
		return;
	}
	let s = (e) => {
		e && e.trigger();
	};
	if (Ne(), t === "clear") o.forEach(s);
	else {
		let i = d(e), a = i && w(n);
		if (i && n === "length") {
			let e = Number(r);
			o.forEach((t, n) => {
				(n === "length" || n === $e || !_(n) && n >= e) && s(t);
			});
		} else switch ((n !== void 0 || o.has(void 0)) && s(o.get(n)), a && s(o.get($e)), t) {
			case "add":
				i ? a && s(o.get("length")) : (s(o.get(Ze)), f(e) && s(o.get(Qe)));
				break;
			case "delete":
				i || (s(o.get(Ze)), f(e) && s(o.get(Qe)));
				break;
			case "set": f(e) && s(o.get(Ze));
		}
	}
	Pe();
}
function nt(e, t) {
	let n = Xe.get(e);
	return n && n.get(t);
}
function rt(e) {
	let t = /* @__PURE__ */ P(e);
	return t === e ? t : (et(t, "iterate", $e), /* @__PURE__ */ Gt(e) ? t : t.map(Jt));
}
function it(e) {
	return et(e = /* @__PURE__ */ P(e), "iterate", $e), e;
}
function at(e, t) {
	return /* @__PURE__ */ Wt(e) ? Yt(/* @__PURE__ */ Ut(e) ? Jt(t) : t) : Jt(t);
}
var ot = {
	__proto__: null,
	[Symbol.iterator]() {
		return st(this, Symbol.iterator, (e) => at(this, e));
	},
	concat(...e) {
		return rt(this).concat(...e.map((e) => d(e) ? rt(e) : e));
	},
	entries() {
		return st(this, "entries", (e) => (e[1] = at(this, e[1]), e));
	},
	every(e, t) {
		return lt(this, "every", e, t, void 0, arguments);
	},
	filter(e, t) {
		return lt(this, "filter", e, t, (e) => e.map((e) => at(this, e)), arguments);
	},
	find(e, t) {
		return lt(this, "find", e, t, (e) => at(this, e), arguments);
	},
	findIndex(e, t) {
		return lt(this, "findIndex", e, t, void 0, arguments);
	},
	findLast(e, t) {
		return lt(this, "findLast", e, t, (e) => at(this, e), arguments);
	},
	findLastIndex(e, t) {
		return lt(this, "findLastIndex", e, t, void 0, arguments);
	},
	forEach(e, t) {
		return lt(this, "forEach", e, t, void 0, arguments);
	},
	includes(...e) {
		return dt(this, "includes", e);
	},
	indexOf(...e) {
		return dt(this, "indexOf", e);
	},
	join(e) {
		return rt(this).join(e);
	},
	lastIndexOf(...e) {
		return dt(this, "lastIndexOf", e);
	},
	map(e, t) {
		return lt(this, "map", e, t, void 0, arguments);
	},
	pop() {
		return ft(this, "pop");
	},
	push(...e) {
		return ft(this, "push", e);
	},
	reduce(e, ...t) {
		return ut(this, "reduce", e, t);
	},
	reduceRight(e, ...t) {
		return ut(this, "reduceRight", e, t);
	},
	shift() {
		return ft(this, "shift");
	},
	some(e, t) {
		return lt(this, "some", e, t, void 0, arguments);
	},
	splice(...e) {
		return ft(this, "splice", e);
	},
	toReversed() {
		return rt(this).toReversed();
	},
	toSorted(e) {
		return rt(this).toSorted(e);
	},
	toSpliced(...e) {
		return rt(this).toSpliced(...e);
	},
	unshift(...e) {
		return ft(this, "unshift", e);
	},
	values() {
		return st(this, "values", (e) => at(this, e));
	}
};
function st(e, t, n) {
	let r = it(e), i = r[t]();
	return r !== e && !/* @__PURE__ */ Gt(e) && (i._next = i.next, i.next = () => {
		let e = i._next();
		return e.done || (e.value = n(e.value)), e;
	}), i;
}
var ct = Array.prototype;
function lt(e, t, n, r, i, a) {
	let o = it(e), s = o !== e && !/* @__PURE__ */ Gt(e), c = o[t];
	if (c !== ct[t]) {
		let t = c.apply(e, a);
		return s ? Jt(t) : t;
	}
	let l = n;
	o !== e && (s ? l = function(t, r) {
		return n.call(this, at(e, t), r, e);
	} : n.length > 2 && (l = function(t, r) {
		return n.call(this, t, r, e);
	}));
	let u = c.call(o, l, r);
	return s && i ? i(u) : u;
}
function ut(e, t, n, r) {
	let i = it(e), a = i !== e && !/* @__PURE__ */ Gt(e), o = n, s = !1;
	i !== e && (a ? (s = r.length === 0, o = function(t, r, i) {
		return s && (s = !1, t = at(e, t)), n.call(this, t, at(e, r), i, e);
	}) : n.length > 3 && (o = function(t, r, i) {
		return n.call(this, t, r, i, e);
	}));
	let c = i[t](o, ...r);
	return s ? at(e, c) : c;
}
function dt(e, t, n) {
	let r = /* @__PURE__ */ P(e);
	et(r, "iterate", $e);
	let i = r[t](...n);
	return (i === -1 || i === !1) && /* @__PURE__ */ Kt(n[0]) ? (n[0] = /* @__PURE__ */ P(n[0]), r[t](...n)) : i;
}
function ft(e, t, n = []) {
	Ue(), Ne();
	let r = (/* @__PURE__ */ P(e))[t].apply(e, n);
	return Pe(), We(), r;
}
var pt = /* @__PURE__ */ e("__proto__,__v_isRef,__isVue"), mt = new Set(/* @__PURE__ */ Object.getOwnPropertyNames(Symbol).filter((e) => e !== "arguments" && e !== "caller").map((e) => Symbol[e]).filter(_));
function ht(e) {
	_(e) || (e = String(e));
	let t = /* @__PURE__ */ P(this);
	return et(t, "has", e), t.hasOwnProperty(e);
}
var gt = class {
	constructor(e = !1, t = !1) {
		this._isReadonly = e, this._isShallow = t;
	}
	get(e, t, n) {
		if (t === "__v_skip") return e.__v_skip;
		let r = this._isReadonly, i = this._isShallow;
		if (t === "__v_isReactive") return !r;
		if (t === "__v_isReadonly") return r;
		if (t === "__v_isShallow") return i;
		if (t === "__v_raw") return n === (r ? i ? It : Ft : i ? Pt : Nt).get(e) || Object.getPrototypeOf(e) === Object.getPrototypeOf(n) ? e : void 0;
		let a = d(e);
		if (!r) {
			let e;
			if (a && (e = ot[t])) return e;
			if (t === "hasOwnProperty") return ht;
		}
		let o = Reflect.get(e, t, /* @__PURE__ */ F(e) ? e : n);
		if ((_(t) ? mt.has(t) : pt(t)) || (r || et(e, "get", t), i)) return o;
		if (/* @__PURE__ */ F(o)) {
			let e = a && w(t) ? o : o.value;
			return r && v(e) ? /* @__PURE__ */ Bt(e) : e;
		}
		return v(o) ? r ? /* @__PURE__ */ Bt(o) : /* @__PURE__ */ Rt(o) : o;
	}
}, _t = class extends gt {
	constructor(e = !1) {
		super(!1, e);
	}
	set(e, t, n, r) {
		let i = e[t], a = d(e) && w(t);
		if (!this._isShallow) {
			let e = /* @__PURE__ */ Wt(i);
			if (!/* @__PURE__ */ Gt(n) && !/* @__PURE__ */ Wt(n) && (i = /* @__PURE__ */ P(i), n = /* @__PURE__ */ P(n)), !a && /* @__PURE__ */ F(i) && !/* @__PURE__ */ F(n)) return e || (i.value = n), !0;
		}
		let o = a ? Number(t) < e.length : u(e, t), s = Reflect.set(e, t, n, /* @__PURE__ */ F(e) ? e : r);
		return e === /* @__PURE__ */ P(r) && s && (o ? O(n, i) && tt(e, "set", t, n, i) : tt(e, "add", t, n)), s;
	}
	deleteProperty(e, t) {
		let n = u(e, t), r = e[t], i = Reflect.deleteProperty(e, t);
		return i && n && tt(e, "delete", t, void 0, r), i;
	}
	has(e, t) {
		let n = Reflect.has(e, t);
		return (!_(t) || !mt.has(t)) && et(e, "has", t), n;
	}
	ownKeys(e) {
		return et(e, "iterate", d(e) ? "length" : Ze), Reflect.ownKeys(e);
	}
}, vt = class extends gt {
	constructor(e = !1) {
		super(!0, e);
	}
	set(e, t) {
		return !0;
	}
	deleteProperty(e, t) {
		return !0;
	}
}, yt = /* @__PURE__ */ new _t(), bt = /* @__PURE__ */ new vt(), xt = /* @__PURE__ */ new _t(!0), St = /* @__PURE__ */ new vt(!0), Ct = (e) => e, wt = (e) => Reflect.getPrototypeOf(e);
function Tt(e, t, n) {
	return function(...r) {
		let i = this.__v_raw, a = /* @__PURE__ */ P(i), o = f(a), c = e === "entries" || e === Symbol.iterator && o, l = e === "keys" && o, u = i[e](...r), d = n ? Ct : t ? Yt : Jt;
		return !t && et(a, "iterate", l ? Qe : Ze), s(Object.create(u), { next() {
			let { value: e, done: t } = u.next();
			return t ? {
				value: e,
				done: t
			} : {
				value: c ? [d(e[0]), d(e[1])] : d(e),
				done: t
			};
		} });
	};
}
function Et(e) {
	return function(...t) {
		return e === "delete" ? !1 : e === "clear" ? void 0 : this;
	};
}
function Dt(e, t) {
	let n = {
		get(n) {
			let r = this.__v_raw, i = /* @__PURE__ */ P(r), a = /* @__PURE__ */ P(n);
			e || (O(n, a) && et(i, "get", n), et(i, "get", a));
			let { has: o } = wt(i), s = t ? Ct : e ? Yt : Jt;
			if (o.call(i, n)) return s(r.get(n));
			if (o.call(i, a)) return s(r.get(a));
			r !== i && r.get(n);
		},
		get size() {
			let t = this.__v_raw;
			return !e && et(/* @__PURE__ */ P(t), "iterate", Ze), t.size;
		},
		has(t) {
			let n = this.__v_raw, r = /* @__PURE__ */ P(n), i = /* @__PURE__ */ P(t);
			return e || (O(t, i) && et(r, "has", t), et(r, "has", i)), t === i ? n.has(t) : n.has(t) || n.has(i);
		},
		forEach(n, r) {
			let i = this, a = i.__v_raw, o = /* @__PURE__ */ P(a), s = t ? Ct : e ? Yt : Jt;
			return !e && et(o, "iterate", Ze), a.forEach((e, t) => n.call(r, s(e), s(t), i));
		}
	};
	return s(n, e ? {
		add: Et("add"),
		set: Et("set"),
		delete: Et("delete"),
		clear: Et("clear")
	} : {
		add(e) {
			let n = /* @__PURE__ */ P(this), r = wt(n), i = /* @__PURE__ */ P(e), a = !t && !/* @__PURE__ */ Gt(e) && !/* @__PURE__ */ Wt(e) ? i : e;
			return r.has.call(n, a) || O(e, a) && r.has.call(n, e) || O(i, a) && r.has.call(n, i) || (n.add(a), tt(n, "add", a, a)), this;
		},
		set(e, n) {
			!t && !/* @__PURE__ */ Gt(n) && !/* @__PURE__ */ Wt(n) && (n = /* @__PURE__ */ P(n));
			let r = /* @__PURE__ */ P(this), { has: i, get: a } = wt(r), o = i.call(r, e);
			o ||= (e = /* @__PURE__ */ P(e), i.call(r, e));
			let s = a.call(r, e);
			return r.set(e, n), o ? O(n, s) && tt(r, "set", e, n, s) : tt(r, "add", e, n), this;
		},
		delete(e) {
			let t = /* @__PURE__ */ P(this), { has: n, get: r } = wt(t), i = n.call(t, e);
			i ||= (e = /* @__PURE__ */ P(e), n.call(t, e));
			let a = r ? r.call(t, e) : void 0, o = t.delete(e);
			return i && tt(t, "delete", e, void 0, a), o;
		},
		clear() {
			let e = /* @__PURE__ */ P(this), t = e.size !== 0, n = e.clear();
			return t && tt(e, "clear", void 0, void 0, void 0), n;
		}
	}), [
		"keys",
		"values",
		"entries",
		Symbol.iterator
	].forEach((r) => {
		n[r] = Tt(r, e, t);
	}), n;
}
function Ot(e, t) {
	let n = Dt(e, t);
	return (t, r, i) => r === "__v_isReactive" ? !e : r === "__v_isReadonly" ? e : r === "__v_raw" ? t : Reflect.get(u(n, r) && r in t ? n : t, r, i);
}
var kt = { get: /* @__PURE__ */ Ot(!1, !1) }, At = { get: /* @__PURE__ */ Ot(!1, !0) }, jt = { get: /* @__PURE__ */ Ot(!0, !1) }, Mt = { get: /* @__PURE__ */ Ot(!0, !0) }, Nt = /* @__PURE__ */ new WeakMap(), Pt = /* @__PURE__ */ new WeakMap(), Ft = /* @__PURE__ */ new WeakMap(), It = /* @__PURE__ */ new WeakMap();
function Lt(e) {
	switch (e) {
		case "Object":
		case "Array": return 1;
		case "Map":
		case "Set":
		case "WeakMap":
		case "WeakSet": return 2;
		default: return 0;
	}
}
// @__NO_SIDE_EFFECTS__
function Rt(e) {
	return /* @__PURE__ */ Wt(e) ? e : Ht(e, !1, yt, kt, Nt);
}
// @__NO_SIDE_EFFECTS__
function zt(e) {
	return Ht(e, !1, xt, At, Pt);
}
// @__NO_SIDE_EFFECTS__
function Bt(e) {
	return Ht(e, !0, bt, jt, Ft);
}
// @__NO_SIDE_EFFECTS__
function Vt(e) {
	return Ht(e, !0, St, Mt, It);
}
function Ht(e, t, n, r, i) {
	if (!v(e) || e.__v_raw && !(t && e.__v_isReactive) || e.__v_skip || !Object.isExtensible(e)) return e;
	let a = i.get(e);
	if (a) return a;
	let o = Lt(S(e));
	if (o === 0) return e;
	let s = new Proxy(e, o === 2 ? r : n);
	return i.set(e, s), s;
}
// @__NO_SIDE_EFFECTS__
function Ut(e) {
	return /* @__PURE__ */ Wt(e) ? /* @__PURE__ */ Ut(e.__v_raw) : !!(e && e.__v_isReactive);
}
// @__NO_SIDE_EFFECTS__
function Wt(e) {
	return !!(e && e.__v_isReadonly);
}
// @__NO_SIDE_EFFECTS__
function Gt(e) {
	return !!(e && e.__v_isShallow);
}
// @__NO_SIDE_EFFECTS__
function Kt(e) {
	return e ? !!e.__v_raw : !1;
}
// @__NO_SIDE_EFFECTS__
function P(e) {
	let t = e && e.__v_raw;
	return t ? /* @__PURE__ */ P(t) : e;
}
function qt(e) {
	return !u(e, "__v_skip") && Object.isExtensible(e) && oe(e, "__v_skip", !0), e;
}
var Jt = (e) => v(e) ? /* @__PURE__ */ Rt(e) : e, Yt = (e) => v(e) ? /* @__PURE__ */ Bt(e) : e;
// @__NO_SIDE_EFFECTS__
function F(e) {
	return e ? e.__v_isRef === !0 : !1;
}
// @__NO_SIDE_EFFECTS__
function I(e) {
	return Zt(e, !1);
}
// @__NO_SIDE_EFFECTS__
function Xt(e) {
	return Zt(e, !0);
}
function Zt(e, t) {
	return /* @__PURE__ */ F(e) ? e : new Qt(e, t);
}
var Qt = class {
	constructor(e, t) {
		this.dep = new Je(), this.__v_isRef = !0, this.__v_isShallow = !1, this._rawValue = t ? e : /* @__PURE__ */ P(e), this._value = t ? e : Jt(e), this.__v_isShallow = t;
	}
	get value() {
		return this.dep.track(), this._value;
	}
	set value(e) {
		let t = this._rawValue, n = this.__v_isShallow || /* @__PURE__ */ Gt(e) || /* @__PURE__ */ Wt(e);
		e = n ? e : /* @__PURE__ */ P(e), O(e, t) && (this._rawValue = e, this._value = n ? e : Jt(e), this.dep.trigger());
	}
};
function $t(e) {
	e.dep && e.dep.trigger();
}
function L(e) {
	return /* @__PURE__ */ F(e) ? e.value : e;
}
function en(e) {
	return h(e) ? e() : L(e);
}
var tn = {
	get: (e, t, n) => t === "__v_raw" ? e : L(Reflect.get(e, t, n)),
	set: (e, t, n, r) => {
		let i = e[t];
		return /* @__PURE__ */ F(i) && !/* @__PURE__ */ F(n) ? (i.value = n, !0) : Reflect.set(e, t, n, r);
	}
};
function nn(e) {
	return /* @__PURE__ */ Ut(e) ? e : new Proxy(e, tn);
}
var rn = class {
	constructor(e) {
		this.__v_isRef = !0, this._value = void 0;
		let t = this.dep = new Je(), { get: n, set: r } = e(t.track.bind(t), t.trigger.bind(t));
		this._get = n, this._set = r;
	}
	get value() {
		return this._value = this._get();
	}
	set value(e) {
		this._set(e);
	}
};
function an(e) {
	return new rn(e);
}
// @__NO_SIDE_EFFECTS__
function on(e) {
	let t = d(e) ? Array(e.length) : {};
	for (let n in e) t[n] = un(e, n);
	return t;
}
var sn = class {
	constructor(e, t, n) {
		this._object = e, this._defaultValue = n, this.__v_isRef = !0, this._value = void 0, this._key = _(t) ? t : String(t), this._raw = /* @__PURE__ */ P(e);
		let r = !0, i = e;
		if (!d(e) || _(this._key) || !w(this._key)) do
			r = !/* @__PURE__ */ Kt(i) || /* @__PURE__ */ Gt(i);
		while (r && (i = i.__v_raw));
		this._shallow = r;
	}
	get value() {
		let e = this._object[this._key];
		return this._shallow && (e = L(e)), this._value = e === void 0 ? this._defaultValue : e;
	}
	set value(e) {
		if (this._shallow && /* @__PURE__ */ F(this._raw[this._key])) {
			let t = this._object[this._key];
			if (/* @__PURE__ */ F(t)) {
				t.value = e;
				return;
			}
		}
		this._object[this._key] = e;
	}
	get dep() {
		return nt(this._raw, this._key);
	}
}, cn = class {
	constructor(e) {
		this._getter = e, this.__v_isRef = !0, this.__v_isReadonly = !0, this._value = void 0;
	}
	get value() {
		return this._value = this._getter();
	}
};
// @__NO_SIDE_EFFECTS__
function ln(e, t, n) {
	return /* @__PURE__ */ F(e) ? e : h(e) ? new cn(e) : v(e) && arguments.length > 1 ? un(e, t, n) : /* @__PURE__ */ I(e);
}
function un(e, t, n) {
	return new sn(e, t, n);
}
var dn = class {
	constructor(e, t, n) {
		this.fn = e, this.setter = t, this._value = void 0, this.dep = new Je(this), this.__v_isRef = !0, this.deps = void 0, this.depsTail = void 0, this.flags = 16, this.globalVersion = Ke - 1, this.next = void 0, this.effect = this, this.__v_isReadonly = !t, this.isSSR = n;
	}
	notify() {
		if (this.flags |= 16, !(this.flags & 8) && N !== this) return Me(this, !0), !0;
	}
	get value() {
		let e = this.dep.track();
		return Re(this), e && (e.version = this.dep.version), this._value;
	}
	set value(e) {
		this.setter && this.setter(e);
	}
};
// @__NO_SIDE_EFFECTS__
function fn(e, t, n = !1) {
	let r, i;
	return h(e) ? r = e : (r = e.get, i = e.set), new dn(r, i, n);
}
var pn = {}, mn = /* @__PURE__ */ new WeakMap(), hn = void 0;
function gn(e, t = !1, n = hn) {
	if (n) {
		let t = mn.get(n);
		t || mn.set(n, t = []), t.push(e);
	}
}
function _n(e, n, i = t) {
	let { immediate: a, deep: o, once: s, scheduler: l, augmentJob: u, call: f } = i, p = (e) => o ? e : /* @__PURE__ */ Gt(e) || o === !1 || o === 0 ? vn(e, 1) : vn(e), m, g, _, v, y = !1, b = !1;
	if (/* @__PURE__ */ F(e) ? (g = () => e.value, y = /* @__PURE__ */ Gt(e)) : /* @__PURE__ */ Ut(e) ? (g = () => p(e), y = !0) : d(e) ? (b = !0, y = e.some((e) => /* @__PURE__ */ Ut(e) || /* @__PURE__ */ Gt(e)), g = () => e.map((e) => {
		if (/* @__PURE__ */ F(e)) return e.value;
		if (/* @__PURE__ */ Ut(e)) return p(e);
		if (h(e)) return f ? f(e, 2) : e();
	})) : g = h(e) ? n ? f ? () => f(e, 2) : e : () => {
		if (_) {
			Ue();
			try {
				_();
			} finally {
				We();
			}
		}
		let t = hn;
		hn = m;
		try {
			return f ? f(e, 3, [v]) : e(v);
		} finally {
			hn = t;
		}
	} : r, n && o) {
		let e = g, t = o === !0 ? Infinity : o;
		g = () => vn(e(), t);
	}
	let x = Te(), S = () => {
		m.stop(), x && x.active && c(x.effects, m);
	};
	if (s && n) {
		let e = n;
		n = (...t) => {
			let n = e(...t);
			return S(), n;
		};
	}
	let C = b ? Array(e.length).fill(pn) : pn, w = (e) => {
		if (!(!(m.flags & 1) || !m.dirty && !e)) {
			if (n) {
				let t = m.run();
				if (e || o || y || (b ? t.some((e, t) => O(e, C[t])) : O(t, C))) {
					_ && _();
					let e = hn;
					hn = m;
					try {
						let e = [
							t,
							C === pn ? void 0 : b && C[0] === pn ? [] : C,
							v
						];
						C = t, f ? f(n, 3, e) : n(...e);
					} finally {
						hn = e;
					}
				}
			} else m.run();
		}
	};
	return u && u(w), m = new Oe(g), m.scheduler = l ? () => l(w, !1) : w, v = (e) => gn(e, !1, m), _ = m.onStop = () => {
		let e = mn.get(m);
		if (e) {
			if (f) f(e, 4);
			else for (let t of e) t();
			mn.delete(m);
		}
	}, n ? a ? w(!0) : C = m.run() : l ? l(w.bind(null, !0), !0) : m.run(), S.pause = m.pause.bind(m), S.resume = m.resume.bind(m), S.stop = S, S;
}
function vn(e, t = Infinity, n) {
	if (t <= 0 || !v(e) || e.__v_skip || (n ||= /* @__PURE__ */ new Map(), (n.get(e) || 0) >= t)) return e;
	if (n.set(e, t), t--, /* @__PURE__ */ F(e)) vn(e.value, t, n);
	else if (d(e)) for (let r = 0; r < e.length; r++) vn(e[r], t, n);
	else if (p(e) || f(e)) e.forEach((e) => {
		vn(e, t, n);
	});
	else if (C(e)) {
		for (let r in e) vn(e[r], t, n);
		for (let r of Object.getOwnPropertySymbols(e)) Object.prototype.propertyIsEnumerable.call(e, r) && vn(e[r], t, n);
	}
	return e;
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/@vue+runtime-core@3.5.41/node_modules/@vue/runtime-core/dist/runtime-core.esm-bundler.js
function yn(e, t, n, r) {
	try {
		return r ? e(...r) : e();
	} catch (e) {
		xn(e, t, n);
	}
}
function bn(e, t, n, r) {
	if (h(e)) {
		let i = yn(e, t, n, r);
		return i && y(i) && i.catch((e) => {
			xn(e, t, n);
		}), i;
	}
	if (d(e)) {
		let i = [];
		for (let a = 0; a < e.length; a++) i.push(bn(e[a], t, n, r));
		return i;
	}
}
function xn(e, n, r, i = !0) {
	let a = n ? n.vnode : null, { errorHandler: o, throwUnhandledErrorInProduction: s } = n && n.appContext.config || t;
	if (n) {
		let t = n.parent, i = n.proxy, a = `https://vuejs.org/error-reference/#runtime-${r}`;
		for (; t;) {
			let n = t.ec;
			if (n) {
				for (let t = 0; t < n.length; t++) if (n[t](e, i, a) === !1) return;
			}
			t = t.parent;
		}
		if (o) {
			Ue(), yn(o, null, 10, [
				e,
				i,
				a
			]), We();
			return;
		}
	}
	Sn(e, r, a, i, s);
}
function Sn(e, t, n, r = !0, i = !1) {
	if (i) throw e;
	console.error(e);
}
var Cn = [], wn = -1, Tn = [], En = null, Dn = 0, On = /* @__PURE__ */ Promise.resolve(), kn = null;
function An(e) {
	let t = kn || On;
	return e ? t.then(this ? e.bind(this) : e) : t;
}
function jn(e) {
	let t = wn + 1, n = Cn.length;
	for (; t < n;) {
		let r = t + n >>> 1, i = Cn[r], a = Ln(i);
		a < e || a === e && i.flags & 2 ? t = r + 1 : n = r;
	}
	return t;
}
function Mn(e) {
	if (!(e.flags & 1)) {
		let t = Ln(e), n = Cn[Cn.length - 1];
		!n || !(e.flags & 2) && t >= Ln(n) ? Cn.push(e) : Cn.splice(jn(t), 0, e), e.flags |= 1, Nn();
	}
}
function Nn() {
	kn ||= On.then(Rn);
}
function Pn(e) {
	if (!d(e)) En && e.id === -1 ? En.splice(Dn + 1, 0, e) : e.flags & 1 || (Tn.push(e), e.flags |= 1);
	else for (let t = 0; t < e.length; t++) Tn.push(e[t]);
	Nn();
}
function Fn(e, t, n = wn + 1) {
	for (; n < Cn.length; n++) {
		let t = Cn[n];
		if (t && t.flags & 2) {
			if (e && t.id !== e.uid) continue;
			Cn.splice(n, 1), n--, t.flags & 4 && (t.flags &= -2), t(), t.flags & 4 || (t.flags &= -2);
		}
	}
}
function In(e) {
	if (Tn.length) {
		let e = [...new Set(Tn)].sort((e, t) => Ln(e) - Ln(t));
		if (Tn.length = 0, En) {
			for (let t = 0; t < e.length; t++) En.push(e[t]);
			return;
		}
		for (En = e, Dn = 0; Dn < En.length; Dn++) {
			let e = En[Dn];
			e.flags & 4 && (e.flags &= -2), e.flags & 8 || e(), e.flags &= -2;
		}
		En = null, Dn = 0;
	}
}
var Ln = (e) => e.id == null ? e.flags & 2 ? -1 : Infinity : e.id;
function Rn(e) {
	try {
		for (wn = 0; wn < Cn.length; wn++) {
			let e = Cn[wn];
			e && !(e.flags & 8) && (e.flags & 4 && (e.flags &= -2), yn(e, e.i, e.i ? 15 : 14), e.flags & 4 || (e.flags &= -2));
		}
	} finally {
		for (; wn < Cn.length; wn++) {
			let e = Cn[wn];
			e && (e.flags &= -2);
		}
		wn = -1, Cn.length = 0, In(e), kn = null, (Cn.length || Tn.length) && Rn(e);
	}
}
var zn = null, Bn = null;
function Vn(e) {
	let t = zn;
	return zn = e, Bn = e && e.type.__scopeId || null, t;
}
function R(e, t = zn, n) {
	if (!t || e._n) return e;
	let r = (...n) => {
		r._d && ba(-1);
		let i = Vn(t), a = ga.length, o;
		try {
			o = e(...n);
		} finally {
			for (let e = ga.length; e > a; e--) va();
			Vn(i), r._d && ba(1);
		}
		return o;
	};
	return r._n = !0, r._c = !0, r._d = !0, r;
}
function Hn(e, t, n, r) {
	let i = e.dirs, a = t && t.dirs;
	for (let o = 0; o < i.length; o++) {
		let s = i[o];
		a && (s.oldValue = a[o].value);
		let c = s.dir[r];
		c && (Ue(), bn(c, n, 8, [
			e.el,
			s,
			e,
			t
		]), We());
	}
}
function Un(e, t) {
	if (Ia) {
		let n = Ia.provides, r = Ia.parent && Ia.parent.provides;
		r === n && (n = Ia.provides = Object.create(r)), n[e] = t;
	}
}
function Wn(e, t, n = !1) {
	let r = La();
	if (r || Si) {
		let i = Si ? Si._context.provides : r ? r.parent == null || r.ce ? r.vnode.appContext && r.vnode.appContext.provides : r.parent.provides : void 0;
		if (i && e in i) return i[e];
		if (arguments.length > 1) return n && h(t) ? t.call(r && r.proxy) : t;
	}
}
function Gn() {
	return !!(La() || Si);
}
var Kn = /* @__PURE__ */ Symbol.for("v-scx"), qn = () => Wn(Kn);
function Jn(e, t) {
	return Zn(e, null, t);
}
function Yn(e, t) {
	return Zn(e, null, { flush: "sync" });
}
function Xn(e, t, n) {
	return Zn(e, t, n);
}
function Zn(e, n, i = t) {
	let { immediate: a, deep: o, flush: c, once: l } = i, u = s({}, i), d = n && a || !n && c !== "post", f;
	if (Ua) {
		if (c === "sync") {
			let e = qn();
			f = e.__watcherHandles ||= [];
		} else if (!d) {
			let e = () => {};
			return e.stop = r, e.resume = r, e.pause = r, e;
		}
	}
	let p = Ia;
	u.call = (e, t, n) => bn(e, p, t, n);
	let m = !1;
	c === "post" ? u.scheduler = (e) => {
		ea(e, p && p.suspense);
	} : c !== "sync" && (m = !0, u.scheduler = (e, t) => {
		t ? e() : Mn(e);
	}), u.augmentJob = (e) => {
		n && (e.flags |= 4), m && (e.flags |= 2, p && (e.id = p.uid, e.i = p));
	};
	let h = _n(e, n, u);
	return Ua && (f ? f.push(h) : d && h()), h;
}
function Qn(e, t, n) {
	let r = this.proxy, i = g(e) ? e.includes(".") ? $n(r, e) : () => r[e] : e.bind(r, r), a;
	h(t) ? a = t : (a = t.handler, n = t);
	let o = Ba(this), s = Zn(i, a.bind(r), n);
	return o(), s;
}
function $n(e, t) {
	let n = t.split(".");
	return () => {
		let t = e;
		for (let e = 0; e < n.length && t; e++) t = t[n[e]];
		return t;
	};
}
var er = /* @__PURE__ */ new WeakMap(), tr = /* @__PURE__ */ Symbol("_vte"), nr = (e) => e.__isTeleport, rr = (e) => e && (e.disabled || e.disabled === ""), ir = (e) => e && (e.defer || e.defer === ""), ar = (e) => typeof SVGElement < "u" && e instanceof SVGElement, or = (e) => typeof MathMLElement == "function" && e instanceof MathMLElement, sr = (e, t) => {
	let n = e && e.to;
	return g(n) ? t ? t(n) : null : n;
}, cr = {
	name: "Teleport",
	__isTeleport: !0,
	process(e, t, n, r, i, a, o, s, c, l) {
		let { mc: u, pc: d, pbc: f, o: { insert: p, querySelector: m, createText: h, createComment: g, parentNode: _ } } = l, v = rr(t.props), { dynamicChildren: y } = t, b = (e, t, n) => {
			e.shapeFlag & 16 && u(e.children, t, n, i, a, o, s, c);
		}, x = (e = t) => {
			let n = rr(e.props), r = e.target = sr(e.props, m), a = pr(r, e, h, p);
			r && (o !== "svg" && ar(r) ? o = "svg" : o !== "mathml" && or(r) && (o = "mathml"), i && i.isCE && (i.ce._teleportTargets || (i.ce._teleportTargets = /* @__PURE__ */ new Set())).add(r), n || (b(e, r, a), fr(e, !1)));
		}, S = (e) => {
			let t = () => {
				if (er.get(e) === t) {
					if (er.delete(e), rr(e.props)) {
						let t = _(e.el) || n;
						b(e, t, e.anchor), fr(e, !0);
					}
					x(e);
				}
			};
			er.set(e, t), ea(t, a);
		};
		if (e == null) {
			let e = t.el = h(""), i = t.anchor = h("");
			if (p(e, n, r), p(i, n, r), ir(t.props) || a && a.pendingBranch) {
				S(t);
				return;
			}
			v && (b(t, n, i), fr(t, !0)), x();
		} else {
			t.el = e.el;
			let r = t.anchor = e.anchor, u = er.get(e);
			if (u) {
				u.flags |= 8, er.delete(e), S(t);
				return;
			}
			t.targetStart = e.targetStart;
			let p = t.target = e.target, h = t.targetAnchor = e.targetAnchor, g = rr(e.props), _ = g ? n : p, b = g ? r : h;
			if (o === "svg" || ar(p) ? o = "svg" : (o === "mathml" || or(p)) && (o = "mathml"), y ? (f(e.dynamicChildren, y, _, i, a, o, s), oa(e, t, !0)) : c || d(e, t, _, b, i, a, o, s, !1), v) g ? t.props && e.props && t.props.to !== e.props.to && (t.props.to = e.props.to) : lr(t, n, r, l, 1);
			else if ((t.props && t.props.to) !== (e.props && e.props.to)) {
				let e = sr(t.props, m);
				e && (t.target = e, lr(t, e, null, l, 0));
			} else g && lr(t, p, h, l, 1);
			fr(t, v);
		}
	},
	remove(e, t, n, { um: r, o: { remove: i } }, a) {
		let { shapeFlag: o, children: s, anchor: c, targetStart: l, targetAnchor: u, target: d, props: f } = e, p = rr(f), m = a || !p, h = er.get(e);
		if (h && (h.flags |= 8, er.delete(e)), d && (i(l), i(u)), a && i(c), !h && (p || d) && o & 16) for (let e = 0; e < s.length; e++) {
			let i = s[e];
			r(i, t, n, m, !!i.dynamicChildren);
		}
	},
	move: lr,
	hydrate: ur
};
function lr(e, t, n, { o: { insert: r }, m: i }, a = 2) {
	a === 0 && r(e.targetAnchor, t, n);
	let { el: o, anchor: s, shapeFlag: c, children: l, props: u } = e, d = a === 2;
	if (d && r(o, t, n), !er.has(e) && (!d || rr(u)) && c & 16) for (let e = 0; e < l.length; e++) i(l[e], t, n, 2);
	d && r(s, t, n);
}
function ur(e, t, n, r, i, a, { o: { nextSibling: o, parentNode: s, querySelector: c, insert: l, createText: u } }, d) {
	function f(e, n) {
		let r = n;
		for (; r;) {
			if (r && r.nodeType === 8) {
				if (r.data === "teleport start anchor") t.targetStart = r;
				else if (r.data === "teleport anchor") {
					t.targetAnchor = r, e._lpa = t.targetAnchor && o(t.targetAnchor);
					break;
				}
			}
			r = o(r);
		}
	}
	function p(e, t) {
		t.anchor = d(o(e), t, s(e), n, r, i, a);
	}
	let m = t.target = sr(t.props, c), h = rr(t.props);
	if (m) {
		let c = m._lpa || m.firstChild;
		t.shapeFlag & 16 && (h ? (p(e, t), f(m, c), t.targetAnchor || pr(m, t, u, l, s(e) === m ? e : null)) : (t.anchor = o(e), f(m, c), t.targetAnchor || pr(m, t, u, l), d(c && o(c), t, m, n, r, i, a))), fr(t, h);
	} else h && t.shapeFlag & 16 && (p(e, t), t.targetStart = e, t.targetAnchor = o(e));
	return t.anchor && o(t.anchor);
}
var dr = cr;
function fr(e, t) {
	let n = e.ctx;
	if (n && n.ut) {
		let r, i;
		for (t ? (r = e.el, i = e.anchor) : (r = e.targetStart, i = e.targetAnchor); r && r !== i;) r.nodeType === 1 && r.setAttribute("data-v-owner", n.uid), r = r.nextSibling;
		n.ut();
	}
}
function pr(e, t, n, r, i = null) {
	let a = t.targetStart = n(""), o = t.targetAnchor = n("");
	return a[tr] = o, e && (r(a, e, i), r(o, e, i)), o;
}
var mr = /* @__PURE__ */ Symbol("_leaveCb");
function hr(e) {
	let t = e[0];
	if (e.length > 1) {
		for (let n of e) if (n.type !== ma) {
			t = n;
			break;
		}
	}
	return t;
}
function gr(e) {
	if (!Er(e)) return nr(e.type) && e.children ? hr(e.children) : e;
	if (e.component) return e.component.subTree;
	let { shapeFlag: t, children: n } = e;
	if (n) {
		if (t & 16) return n[0];
		if (t & 32 && h(n.default)) return n.default();
	}
}
function _r(e, t) {
	if (e.shapeFlag & 6 && e.component) {
		e.transition = t;
		let n = e.component.subTree;
		_r(nr(n.type) && gr(n) || n, t);
	} else e.shapeFlag & 128 ? (e.ssContent.transition = t.clone(e.ssContent), e.ssFallback.transition = t.clone(e.ssFallback)) : e.transition = t;
}
// @__NO_SIDE_EFFECTS__
function z(e, t) {
	return h(e) ? /* @__PURE__ */ s({ name: e.name }, t, { setup: e }) : e;
}
function vr() {
	let e = La();
	return e ? (e.appContext.config.idPrefix || "v") + "-" + e.ids[0] + e.ids[1]++ : "";
}
function yr(e) {
	e.ids = [
		e.ids[0] + e.ids[2]++ + "-",
		0,
		0
	];
}
function br(e) {
	let n = La(), r = /* @__PURE__ */ Xt(null);
	if (n) {
		let i = n.refs === t ? n.refs = {} : n.refs;
		Object.defineProperty(i, e, {
			enumerable: !0,
			get: () => r.value,
			set: (e) => r.value = e
		});
	}
	return r;
}
function xr(e, t) {
	let n;
	return !!((n = Object.getOwnPropertyDescriptor(e, t)) && !n.configurable);
}
var Sr = /* @__PURE__ */ new WeakMap();
function Cr(e, n, r, a, o = !1) {
	if (d(e)) {
		e.forEach((e, t) => Cr(e, n && (d(n) ? n[t] : n), r, a, o));
		return;
	}
	if (Tr(a) && !o) {
		a.shapeFlag & 512 && a.type.__asyncResolved && a.component.subTree.component && Cr(e, n, r, a.component.subTree);
		return;
	}
	let s = a.shapeFlag & 4 ? Qa(a.component) : a.el, l = o ? null : s, { i: f, r: p } = e, m = n && n.r, _ = f.refs === t ? f.refs = {} : f.refs, v = f.setupState, y = /* @__PURE__ */ P(v), b = v === t ? i : (e) => !xr(_, e) && u(y, e), x = (e, t) => !(t && xr(_, t));
	if (m != null && m !== p) {
		if (wr(n), g(m)) _[m] = null, b(m) && (v[m] = null);
		else if (/* @__PURE__ */ F(m)) {
			let e = n;
			x(m, e.k) && (m.value = null), e.k && (_[e.k] = null);
		}
	}
	if (h(p)) yn(p, f, 12, [l, _]);
	else {
		let t = g(p), n = /* @__PURE__ */ F(p);
		if (t || n) {
			let i = () => {
				if (e.f) {
					let n = t ? b(p) ? v[p] : _[p] : x(p) || !e.k ? p.value : _[e.k];
					if (o) d(n) && c(n, s);
					else if (d(n)) n.includes(s) || n.push(s);
					else if (t) _[p] = [s], b(p) && (v[p] = _[p]);
					else {
						let t = [s];
						x(p, e.k) && (p.value = t), e.k && (_[e.k] = t);
					}
				} else t ? (_[p] = l, b(p) && (v[p] = l)) : n && (x(p, e.k) && (p.value = l), e.k && (_[e.k] = l));
			};
			if (l) {
				let t = () => {
					i(), Sr.delete(e);
				};
				t.id = -1, Sr.set(e, t), ea(t, r);
			} else wr(e), i();
		}
	}
}
function wr(e) {
	let t = Sr.get(e);
	t && (t.flags |= 8, Sr.delete(e));
}
ce().requestIdleCallback, ce().cancelIdleCallback;
var Tr = (e) => !!e.type.__asyncLoader, Er = (e) => e.type.__isKeepAlive;
function Dr(e, t) {
	kr(e, "a", t);
}
function Or(e, t) {
	kr(e, "da", t);
}
function kr(e, t, n = Ia) {
	let r = e.__wdc ||= () => {
		let t = n;
		for (; t;) {
			if (t.isDeactivated) return;
			t = t.parent;
		}
		return e();
	};
	if (jr(t, r, n), n) {
		let e = n.parent;
		for (; e && e.parent;) Er(e.parent.vnode) && Ar(r, t, n, e), e = e.parent;
	}
}
function Ar(e, t, n, r) {
	let i = jr(t, e, r, !0);
	Rr(() => {
		c(r[t], i);
	}, n);
}
function jr(e, t, n = Ia, r = !1) {
	if (n) {
		let i = n[e] || (n[e] = []), a = t.__weh ||= (...r) => {
			Ue();
			let i = Ba(n), a = bn(t, n, e, r);
			return i(), We(), a;
		};
		return r ? i.unshift(a) : i.push(a), a;
	}
}
var Mr = (e) => (t, n = Ia) => {
	(!Ua || e === "sp") && jr(e, (...e) => t(...e), n);
}, Nr = Mr("bm"), Pr = Mr("m"), Fr = Mr("bu"), Ir = Mr("u"), Lr = Mr("bum"), Rr = Mr("um"), zr = Mr("sp"), Br = Mr("rtg"), Vr = Mr("rtc");
function Hr(e, t = Ia) {
	jr("ec", e, t);
}
var Ur = "components", Wr = /* @__PURE__ */ Symbol.for("v-ndc");
function Gr(e) {
	return g(e) ? Kr(Ur, e, !1) || e : e || Wr;
}
function Kr(e, t, n = !0, r = !1) {
	let i = zn || Ia;
	if (i) {
		let n = i.type;
		if (e === Ur) {
			let e = $a(n, !1);
			if (e && (e === t || e === D(t) || e === re(D(t)))) return n;
		}
		let a = qr(i[e] || n[e], t) || qr(i.appContext[e], t);
		return !a && r ? n : a;
	}
}
function qr(e, t) {
	return e && (e[t] || e[D(t)] || e[re(D(t))]);
}
function Jr(e, t, n, r) {
	let i, a = n && n[r], o = d(e);
	if (o || g(e)) {
		let n = o && /* @__PURE__ */ Ut(e), r = !1, s = !1;
		n && (r = !/* @__PURE__ */ Gt(e), s = /* @__PURE__ */ Wt(e), e = it(e)), i = Array(e.length);
		for (let n = 0, o = e.length; n < o; n++) i[n] = t(r ? s ? Yt(Jt(e[n])) : Jt(e[n]) : e[n], n, void 0, a && a[n]);
	} else if (typeof e == "number") {
		i = Array(e);
		for (let n = 0; n < e; n++) i[n] = t(n + 1, n, void 0, a && a[n]);
	} else if (v(e)) {
		if (e[Symbol.iterator]) i = Array.from(e, (e, n) => t(e, n, void 0, a && a[n]));
		else {
			let n = Object.keys(e);
			i = Array(n.length);
			for (let r = 0, o = n.length; r < o; r++) {
				let o = n[r];
				i[r] = t(e[o], o, r, a && a[r]);
			}
		}
	} else i = [];
	return n && (n[r] = i), i;
}
function B(e, t, n, r, i, a) {
	if (n ??= {}, zn.ce || zn.parent && Tr(zn.parent) && zn.parent.ce) {
		let e = a != null && n.key == null ? s({}, n, { key: a }) : n, i = Object.keys(e).length > 0;
		return t !== "default" && (e.name = t), H(), W(V, null, [K("slot", e, r && r())], i ? -2 : 64);
	}
	let o = e[t];
	o && o._c && (o._d = !1);
	let c = ga.length;
	H();
	let l;
	try {
		let i = o && Yr(o(n)), s = n.key || a || i && i.key;
		l = W(V, { key: (s && !_(s) ? s : `_${t}`) + (!i && r ? "_fb" : "") }, i || (r ? r() : []), i && e._ === 1 ? 64 : -2);
	} catch (e) {
		for (let e = ga.length; e > c; e--) va();
		throw e;
	} finally {
		o && o._c && (o._d = !0);
	}
	return !i && l.scopeId && (l.slotScopeIds = [l.scopeId + "-s"]), l;
}
function Yr(e) {
	return e.some((e) => !Sa(e) || !(e.type === ma || e.type === V && !Yr(e.children))) ? e : null;
}
var Xr = (e) => e ? Ha(e) ? Qa(e) : Xr(e.parent) : null, Zr = /* @__PURE__ */ s(/* @__PURE__ */ Object.create(null), {
	$: (e) => e,
	$el: (e) => e.vnode.el,
	$data: (e) => e.data,
	$props: (e) => e.props,
	$attrs: (e) => e.attrs,
	$slots: (e) => e.slots,
	$refs: (e) => e.refs,
	$parent: (e) => Xr(e.parent),
	$root: (e) => Xr(e.root),
	$host: (e) => e.ce,
	$emit: (e) => e.emit,
	$options: (e) => li(e),
	$forceUpdate: (e) => e.f ||= () => {
		Mn(e.update);
	},
	$nextTick: (e) => e.n ||= An.bind(e.proxy),
	$watch: (e) => Qn.bind(e)
}), Qr = (e, n) => e !== t && !e.__isScriptSetup && u(e, n), $r = {
	get({ _: e }, n) {
		if (n === "__v_skip") return !0;
		let { ctx: r, setupState: i, data: a, props: o, accessCache: s, type: c, appContext: l } = e;
		if (n[0] !== "$") {
			let e = s[n];
			if (e !== void 0) switch (e) {
				case 1: return i[n];
				case 2: return a[n];
				case 4: return r[n];
				case 3: return o[n];
			}
			else if (Qr(i, n)) return s[n] = 1, i[n];
			else if (a !== t && u(a, n)) return s[n] = 2, a[n];
			else if (u(o, n)) return s[n] = 3, o[n];
			else if (r !== t && u(r, n)) return s[n] = 4, r[n];
			else ii && (s[n] = 0);
		}
		let d = Zr[n], f, p;
		if (d) return n === "$attrs" && et(e.attrs, "get", ""), d(e);
		if ((f = c.__cssModules) && (f = f[n])) return f;
		if (r !== t && u(r, n)) return s[n] = 4, r[n];
		if (p = l.config.globalProperties, u(p, n)) return p[n];
	},
	set({ _: e }, n, r) {
		let { data: i, setupState: a, ctx: o } = e;
		return Qr(a, n) ? (a[n] = r, !0) : i !== t && u(i, n) ? (i[n] = r, !0) : u(e.props, n) || n[0] === "$" && n.slice(1) in e ? !1 : (o[n] = r, !0);
	},
	has({ _: { data: e, setupState: n, accessCache: r, ctx: i, appContext: a, props: o, type: s } }, c) {
		let l;
		return !!(r[c] || e !== t && c[0] !== "$" && u(e, c) || Qr(n, c) || u(o, c) || u(i, c) || u(Zr, c) || u(a.config.globalProperties, c) || (l = s.__cssModules) && l[c]);
	},
	defineProperty(e, t, n) {
		return n.get == null ? u(n, "value") && this.set(e, t, n.value, null) : e._.accessCache[t] = 0, Reflect.defineProperty(e, t, n);
	}
};
function ei() {
	return ti("useSlots").slots;
}
function ti(e) {
	let t = La();
	return t.setupContext ||= Za(t);
}
function ni(e) {
	return d(e) ? e.reduce((e, t) => (e[t] = null, e), {}) : e;
}
function ri(e, t) {
	return !e || !t ? e || t : d(e) && d(t) ? e.concat(t) : s({}, ni(e), ni(t));
}
var ii = !0;
function ai(e) {
	let t = li(e), n = e.proxy, i = e.ctx;
	ii = !1, t.beforeCreate && si(t.beforeCreate, e, "bc");
	let { data: a, computed: o, methods: s, watch: c, provide: l, inject: u, created: f, beforeMount: p, mounted: m, beforeUpdate: g, updated: _, activated: y, deactivated: b, beforeDestroy: x, beforeUnmount: S, destroyed: C, unmounted: w, render: T, renderTracked: ee, renderTriggered: E, errorCaptured: D, serverPrefetch: te, expose: ne, inheritAttrs: re, components: ie, directives: O, filters: ae } = t;
	if (u && oi(u, i, null), s) for (let e in s) {
		let t = s[e];
		h(t) && (i[e] = t.bind(n));
	}
	if (a) {
		let t = a.call(n, n);
		v(t) && (e.data = /* @__PURE__ */ Rt(t));
	}
	if (ii = !0, o) for (let e in o) {
		let t = o[e], a = X({
			get: h(t) ? t.bind(n, n) : h(t.get) ? t.get.bind(n, n) : r,
			set: !h(t) && h(t.set) ? t.set.bind(n) : r
		});
		Object.defineProperty(i, e, {
			enumerable: !0,
			configurable: !0,
			get: () => a.value,
			set: (e) => a.value = e
		});
	}
	if (c) for (let e in c) ci(c[e], i, n, e);
	if (l) {
		let e = h(l) ? l.call(n) : l;
		Reflect.ownKeys(e).forEach((t) => {
			Un(t, e[t]);
		});
	}
	f && si(f, e, "c");
	function oe(e, t) {
		d(t) ? t.forEach((t) => e(t.bind(n))) : t && e(t.bind(n));
	}
	if (oe(Nr, p), oe(Pr, m), oe(Fr, g), oe(Ir, _), oe(Dr, y), oe(Or, b), oe(Hr, D), oe(Vr, ee), oe(Br, E), oe(Lr, S), oe(Rr, w), oe(zr, te), d(ne)) {
		if (ne.length) {
			let t = e.exposed ||= {};
			ne.forEach((e) => {
				Object.defineProperty(t, e, {
					get: () => n[e],
					set: (t) => n[e] = t,
					enumerable: !0
				});
			});
		} else e.exposed ||= {};
	}
	T && e.render === r && (e.render = T), re != null && (e.inheritAttrs = re), ie && (e.components = ie), O && (e.directives = O), te && yr(e);
}
function oi(e, t, n = r) {
	d(e) && (e = mi(e));
	for (let n in e) {
		let r = e[n], i;
		i = v(r) ? "default" in r ? Wn(r.from || n, r.default, !0) : Wn(r.from || n) : Wn(r), /* @__PURE__ */ F(i) ? Object.defineProperty(t, n, {
			enumerable: !0,
			configurable: !0,
			get: () => i.value,
			set: (e) => i.value = e
		}) : t[n] = i;
	}
}
function si(e, t, n) {
	bn(d(e) ? e.map((e) => e.bind(t.proxy)) : e.bind(t.proxy), t, n);
}
function ci(e, t, n, r) {
	let i = r.includes(".") ? $n(n, r) : () => n[r];
	if (g(e)) {
		let n = t[e];
		h(n) && Xn(i, n);
	} else if (h(e)) Xn(i, e.bind(n));
	else if (v(e)) {
		if (d(e)) e.forEach((e) => ci(e, t, n, r));
		else {
			let r = h(e.handler) ? e.handler.bind(n) : t[e.handler];
			h(r) && Xn(i, r, e);
		}
	}
}
function li(e) {
	let t = e.type, { mixins: n, extends: r } = t, { mixins: i, optionsCache: a, config: { optionMergeStrategies: o } } = e.appContext, s = a.get(t), c;
	return s ? c = s : !i.length && !n && !r ? c = t : (c = {}, i.length && i.forEach((e) => ui(c, e, o, !0)), ui(c, t, o)), v(t) && a.set(t, c), c;
}
function ui(e, t, n, r = !1) {
	let { mixins: i, extends: a } = t;
	a && ui(e, a, n, !0), i && i.forEach((t) => ui(e, t, n, !0));
	for (let i in t) if (!(r && i === "expose")) {
		let r = di[i] || n && n[i];
		e[i] = r ? r(e[i], t[i]) : t[i];
	}
	return e;
}
var di = {
	data: fi,
	props: _i,
	emits: _i,
	methods: gi,
	computed: gi,
	beforeCreate: hi,
	created: hi,
	beforeMount: hi,
	mounted: hi,
	beforeUpdate: hi,
	updated: hi,
	beforeDestroy: hi,
	beforeUnmount: hi,
	destroyed: hi,
	unmounted: hi,
	activated: hi,
	deactivated: hi,
	errorCaptured: hi,
	serverPrefetch: hi,
	components: gi,
	directives: gi,
	watch: vi,
	provide: fi,
	inject: pi
};
function fi(e, t) {
	return t ? e ? function() {
		return s(h(e) ? e.call(this, this) : e, h(t) ? t.call(this, this) : t);
	} : t : e;
}
function pi(e, t) {
	return gi(mi(e), mi(t));
}
function mi(e) {
	if (d(e)) {
		let t = {};
		for (let n = 0; n < e.length; n++) t[e[n]] = e[n];
		return t;
	}
	return e;
}
function hi(e, t) {
	return e ? [...new Set([].concat(e, t))] : t;
}
function gi(e, t) {
	return e ? s(/* @__PURE__ */ Object.create(null), e, t) : t;
}
function _i(e, t) {
	return e ? d(e) && d(t) ? [.../* @__PURE__ */ new Set([...e, ...t])] : s(/* @__PURE__ */ Object.create(null), ni(e), ni(t ?? {})) : t;
}
function vi(e, t) {
	if (!e) return t;
	if (!t) return e;
	let n = s(/* @__PURE__ */ Object.create(null), e);
	for (let r in t) n[r] = hi(e[r], t[r]);
	return n;
}
function yi() {
	return {
		app: null,
		config: {
			isNativeTag: i,
			performance: !1,
			globalProperties: {},
			optionMergeStrategies: {},
			errorHandler: void 0,
			warnHandler: void 0,
			compilerOptions: {}
		},
		mixins: [],
		components: {},
		directives: {},
		provides: /* @__PURE__ */ Object.create(null),
		optionsCache: /* @__PURE__ */ new WeakMap(),
		propsCache: /* @__PURE__ */ new WeakMap(),
		emitsCache: /* @__PURE__ */ new WeakMap()
	};
}
var bi = 0;
function xi(e, t) {
	return function(n, r = null) {
		h(n) || (n = s({}, n)), r != null && !v(r) && (r = null);
		let i = yi(), a = /* @__PURE__ */ new WeakSet(), o = [], c = !1, l = i.app = {
			_uid: bi++,
			_component: n,
			_props: r,
			_container: null,
			_context: i,
			_instance: null,
			version: no,
			get config() {
				return i.config;
			},
			set config(e) {},
			use(e, ...t) {
				return a.has(e) || (e && h(e.install) ? (a.add(e), e.install(l, ...t)) : h(e) && (a.add(e), e(l, ...t))), l;
			},
			mixin(e) {
				return i.mixins.includes(e) || i.mixins.push(e), l;
			},
			component(e, t) {
				return t ? (i.components[e] = t, l) : i.components[e];
			},
			directive(e, t) {
				return t ? (i.directives[e] = t, l) : i.directives[e];
			},
			mount(a, o, s) {
				if (!c) {
					let u = l._ceVNode || K(n, r);
					return u.appContext = i, s === !0 ? s = "svg" : s === !1 && (s = void 0), o && t ? t(u, a) : e(u, a, s), c = !0, l._container = a, a.__vue_app__ = l, Qa(u.component);
				}
			},
			onUnmount(e) {
				o.push(e);
			},
			unmount() {
				c && (bn(o, l._instance, 16), e(null, l._container), delete l._container.__vue_app__);
			},
			provide(e, t) {
				return i.provides[e] = t, l;
			},
			runWithContext(e) {
				let t = Si;
				Si = l;
				try {
					return e();
				} finally {
					Si = t;
				}
			}
		};
		return l;
	};
}
var Si = null;
function Ci(e, n, r = t) {
	let i = La(), a = D(n), o = ne(n), s = wi(e, a), c = an((s, c) => {
		let l, u = t, d;
		return Yn(() => {
			let t = e[a];
			O(l, t) && (l = t, c());
		}), {
			get() {
				return s(), r.get ? r.get(l) : l;
			},
			set(e) {
				let s = r.set ? r.set(e) : e;
				if (!O(s, l) && !(u !== t && O(e, u))) return;
				let f = i.vnode.props, p = !!(f && (n in f || a in f || o in f) && (`onUpdate:${n}` in f || `onUpdate:${a}` in f || `onUpdate:${o}` in f));
				p || (l = e, c()), i.emit(`update:${n}`, s), O(e, u) && (O(e, s) && !O(s, d) || p && u !== t && !O(s, l)) && c(), u = e, d = s;
			}
		};
	});
	return c[Symbol.iterator] = () => {
		let e = 0;
		return { next() {
			return e < 2 ? {
				value: e++ ? s || t : c,
				done: !1
			} : { done: !0 };
		} };
	}, c;
}
var wi = (e, t) => t === "modelValue" || t === "model-value" ? e.modelModifiers : e[`${t}Modifiers`] || e[`${D(t)}Modifiers`] || e[`${ne(t)}Modifiers`];
function Ti(e, n, ...r) {
	if (e.isUnmounted) return;
	let i = e.vnode.props || t, a = r, o = n.startsWith("update:"), s = o && wi(i, n.slice(7));
	s && (s.trim && (a = r.map((e) => g(e) ? e.trim() : e)), s.number && (a = r.map(k)));
	let c, l = i[c = ie(n)] || i[c = ie(D(n))];
	!l && o && (l = i[c = ie(ne(n))]), l && bn(l, e, 6, a);
	let u = i[c + "Once"];
	if (u) {
		if (!e.emitted) e.emitted = {};
		else if (e.emitted[c]) return;
		e.emitted[c] = !0, bn(u, e, 6, a);
	}
}
var Ei = /* @__PURE__ */ new WeakMap();
function Di(e, t, n = !1) {
	let r = n ? Ei : t.emitsCache, i = r.get(e);
	if (i !== void 0) return i;
	let a = e.emits, o = {}, c = !1;
	if (!h(e)) {
		let r = (e) => {
			let n = Di(e, t, !0);
			n && (c = !0, s(o, n));
		};
		!n && t.mixins.length && t.mixins.forEach(r), e.extends && r(e.extends), e.mixins && e.mixins.forEach(r);
	}
	return !a && !c ? (v(e) && r.set(e, null), null) : (d(a) ? a.forEach((e) => o[e] = null) : s(o, a), v(e) && r.set(e, o), o);
}
function Oi(e, t) {
	return !e || !a(t) ? !1 : (t = t.slice(2), t = t === "Once" ? t : t.replace(/Once$/, ""), u(e, t[0].toLowerCase() + t.slice(1)) || u(e, ne(t)) || u(e, t));
}
function ki(e) {
	let { type: t, vnode: n, proxy: r, withProxy: i, propsOptions: [a], slots: s, attrs: c, emit: l, render: u, renderCache: d, props: f, data: p, setupState: m, ctx: h, inheritAttrs: g } = e, _ = Vn(e), v, y;
	try {
		if (n.shapeFlag & 4) {
			let e = i || r, t = e;
			v = ka(u.call(t, e, d, f, m, p, h)), y = c;
		} else {
			let e = t;
			v = ka(e.length > 1 ? e(f, {
				attrs: c,
				slots: s,
				emit: l
			}) : e(f, null)), y = t.props ? c : Ai(c);
		}
	} catch (t) {
		ga.length = 0, xn(t, e, 1), v = K(ma);
	}
	let b = v;
	if (y && g !== !1) {
		let e = Object.keys(y), { shapeFlag: t } = b;
		e.length && t & 7 && (a && e.some(o) && (y = ji(y, a)), b = Oa(b, y, !1, !0));
	}
	return n.dirs && (b = Oa(b, null, !1, !0), b.dirs = b.dirs ? b.dirs.concat(n.dirs) : n.dirs), n.transition && _r(nr(b.type) && gr(b) || b, n.transition), v = b, Vn(_), v;
}
var Ai = (e) => {
	let t;
	for (let n in e) (n === "class" || n === "style" || a(n)) && ((t ||= {})[n] = e[n]);
	return t;
}, ji = (e, t) => {
	let n = {};
	for (let r in e) (!o(r) || !(r.slice(9) in t)) && (n[r] = e[r]);
	return n;
};
function Mi(e, t, n) {
	let { props: r, children: i, component: a } = e, { props: o, children: s, patchFlag: c } = t, l = a.emitsOptions;
	if (t.dirs || t.transition) return !0;
	if (n && c >= 0) {
		if (c & 1024) return !0;
		if (c & 16) return r ? Ni(r, o, l) : !!o;
		if (c & 8) {
			let e = t.dynamicProps;
			for (let t = 0; t < e.length; t++) {
				let n = e[t];
				if (Pi(o, r, n) && !Oi(l, n)) return !0;
			}
		}
	} else return (i || s) && (!s || !s.$stable) ? !0 : r === o ? !1 : r ? !o || Ni(r, o, l) : !!o;
	return !1;
}
function Ni(e, t, n) {
	let r = Object.keys(t);
	if (r.length !== Object.keys(e).length) return !0;
	for (let i = 0; i < r.length; i++) {
		let a = r[i];
		if (Pi(t, e, a) && !Oi(n, a)) return !0;
	}
	return !1;
}
function Pi(e, t, n) {
	let r = e[n], i = t[n];
	return n === "style" && v(r) && v(i) ? !ve(r, i) : r !== i;
}
function Fi({ vnode: e, parent: t, suspense: n }, r) {
	for (; t;) {
		let n = t.subTree;
		if (n.suspense && n.suspense.activeBranch === e && (n.suspense.vnode.el = n.el = r, e = n), n === e) (e = t.vnode).el = r, t = t.parent;
		else break;
	}
	n && n.activeBranch === e && (n.vnode.el = r);
}
var Ii = {}, Li = () => Object.create(Ii), Ri = (e) => Object.getPrototypeOf(e) === Ii;
function zi(e, t, n, r = !1) {
	let i = {}, a = Li();
	e.propsDefaults = /* @__PURE__ */ Object.create(null), Vi(e, t, i, a);
	for (let t in e.propsOptions[0]) t in i || (i[t] = void 0);
	e.props = n ? r ? i : /* @__PURE__ */ zt(i) : e.type.props ? i : a, e.attrs = a;
}
function Bi(e, t, n, r) {
	let { props: i, attrs: a, vnode: { patchFlag: o } } = e, s = /* @__PURE__ */ P(i), [c] = e.propsOptions, l = !1;
	if ((r || o > 0) && !(o & 16)) {
		if (o & 8) {
			let n = e.vnode.dynamicProps;
			for (let r = 0; r < n.length; r++) {
				let o = n[r];
				if (Oi(e.emitsOptions, o)) continue;
				let d = t[o];
				if (c) {
					if (u(a, o)) d !== a[o] && (a[o] = d, l = !0);
					else {
						let t = D(o);
						i[t] = Hi(c, s, t, d, e, !1);
					}
				} else d !== a[o] && (a[o] = d, l = !0);
			}
		}
	} else {
		Vi(e, t, i, a) && (l = !0);
		let r;
		for (let a in s) (!t || !u(t, a) && ((r = ne(a)) === a || !u(t, r))) && (c ? n && (n[a] !== void 0 || n[r] !== void 0) && (i[a] = Hi(c, s, a, void 0, e, !0)) : delete i[a]);
		if (a !== s) for (let e in a) (!t || !u(t, e)) && (delete a[e], l = !0);
	}
	l && tt(e.attrs, "set", "");
}
function Vi(e, n, r, i) {
	let [a, o] = e.propsOptions, s = !1, c;
	if (n) for (let t in n) {
		if (T(t)) continue;
		let l = n[t], d;
		a && u(a, d = D(t)) ? !o || !o.includes(d) ? r[d] = l : (c ||= {})[d] = l : Oi(e.emitsOptions, t) || (!(t in i) || l !== i[t]) && (i[t] = l, s = !0);
	}
	if (o) {
		let n = /* @__PURE__ */ P(r), i = c || t;
		for (let t = 0; t < o.length; t++) {
			let s = o[t];
			r[s] = Hi(a, n, s, i[s], e, !u(i, s));
		}
	}
	return s;
}
function Hi(e, t, n, r, i, a) {
	let o = e[n];
	if (o != null) {
		let e = u(o, "default");
		if (e && r === void 0) {
			let e = o.default;
			if (o.type !== Function && !o.skipFactory && h(e)) {
				let { propsDefaults: a } = i;
				if (n in a) r = a[n];
				else {
					let o = Ba(i);
					r = a[n] = e.call(null, t), o();
				}
			} else r = e;
			i.ce && i.ce._setProp(n, r);
		}
		o[0] && (a && !e ? r = !1 : o[1] && (r === "" || r === ne(n)) && (r = !0));
	}
	return r;
}
var Ui = /* @__PURE__ */ new WeakMap();
function Wi(e, r, i = !1) {
	let a = i ? Ui : r.propsCache, o = a.get(e);
	if (o) return o;
	let c = e.props, l = {}, f = [], p = !1;
	if (!h(e)) {
		let t = (e) => {
			p = !0;
			let [t, n] = Wi(e, r, !0);
			s(l, t), n && f.push(...n);
		};
		!i && r.mixins.length && r.mixins.forEach(t), e.extends && t(e.extends), e.mixins && e.mixins.forEach(t);
	}
	if (!c && !p) return v(e) && a.set(e, n), n;
	if (d(c)) for (let e = 0; e < c.length; e++) {
		let n = D(c[e]);
		Gi(n) && (l[n] = t);
	}
	else if (c) for (let e in c) {
		let t = D(e);
		if (Gi(t)) {
			let n = c[e], r = l[t] = d(n) || h(n) ? { type: n } : s({}, n), i = r.type, a = !1, o = !0;
			if (d(i)) for (let e = 0; e < i.length; ++e) {
				let t = i[e], n = h(t) && t.name;
				if (n === "Boolean") {
					a = !0;
					break;
				}
				n === "String" && (o = !1);
			}
			else a = h(i) && i.name === "Boolean";
			r[0] = a, r[1] = o, (a || u(r, "default")) && f.push(t);
		}
	}
	let m = [l, f];
	return v(e) && a.set(e, m), m;
}
function Gi(e) {
	return e[0] !== "$" && !T(e);
}
var Ki = (e) => e === "_" || e === "_ctx" || e === "$stable", qi = (e) => d(e) ? e.map(ka) : [ka(e)], Ji = (e, t, n) => {
	if (t._n) return t;
	let r = R((...e) => qi(t(...e)), n);
	return r._c = !1, r;
}, Yi = (e, t, n) => {
	let r = e._ctx;
	for (let n in e) {
		if (Ki(n)) continue;
		let i = e[n];
		if (h(i)) t[n] = Ji(n, i, r);
		else if (i != null) {
			let e = qi(i);
			t[n] = () => e;
		}
	}
}, Xi = (e, t) => {
	let n = qi(t);
	e.slots.default = () => n;
}, Zi = (e, t, n) => {
	for (let r in t) (n || !Ki(r)) && (e[r] = t[r]);
}, Qi = (e, t, n) => {
	let r = e.slots = Li();
	if (e.vnode.shapeFlag & 32) {
		let e = t._;
		e ? (Zi(r, t, n), n && oe(r, "_", e, !0)) : Yi(t, r);
	} else t && Xi(e, t);
}, $i = (e, n, r) => {
	let { vnode: i, slots: a } = e, o = !0, s = t;
	if (i.shapeFlag & 32) {
		let e = n._;
		e ? r && e === 1 ? o = !1 : Zi(a, n, r) : (o = !n.$stable, Yi(n, a)), s = n;
	} else n && (Xi(e, n), s = { default: 1 });
	if (o) for (let e in a) !Ki(e) && s[e] == null && delete a[e];
}, ea = fa;
function ta(e) {
	return na(e);
}
function na(e, i) {
	let a = ce();
	a.__VUE__ = !0;
	let { insert: o, remove: s, patchProp: c, createElement: l, createText: u, createComment: d, setText: f, setElementText: p, parentNode: m, nextSibling: h, setScopeId: g = r, insertStaticContent: _ } = e, v = (e, t, n, r = null, i = null, a = null, o = void 0, s = null, c = !!t.dynamicChildren) => {
		if (e === t) return;
		e && !Ca(e, t) && (r = _e(e), A(e, i, a, !0), e = null), t.patchFlag === -2 && (c = !1, t.dynamicChildren = null);
		let { type: l, ref: u, shapeFlag: d } = t;
		switch (l) {
			case pa:
				y(e, t, n, r);
				break;
			case ma:
				b(e, t, n, r);
				break;
			case ha:
				e ?? x(t, n, r, o);
				break;
			case V:
				ie(e, t, n, r, i, a, o, s, c);
				break;
			default: d & 1 ? w(e, t, n, r, i, a, o, s, c) : d & 6 ? O(e, t, n, r, i, a, o, s, c) : (d & 64 || d & 128) && l.process(e, t, n, r, i, a, o, s, c, M);
		}
		u != null && i ? Cr(u, e && e.ref, a, t || e, !t) : u == null && e && e.ref != null && Cr(e.ref, null, a, e, !0);
	}, y = (e, t, n, r) => {
		if (e == null) o(t.el = u(t.children), n, r);
		else {
			let n = t.el = e.el;
			t.children !== e.children && f(n, t.children);
		}
	}, b = (e, t, n, r) => {
		e == null ? o(t.el = d(t.children || ""), n, r) : t.el = e.el;
	}, x = (e, t, n, r) => {
		[e.el, e.anchor] = _(e.children, t, n, r, e.el, e.anchor);
	}, S = ({ el: e, anchor: t }, n, r) => {
		let i;
		for (; e && e !== t;) i = h(e), o(e, n, r), e = i;
		o(t, n, r);
	}, C = ({ el: e, anchor: t }) => {
		let n;
		for (; e && e !== t;) n = h(e), s(e), e = n;
		s(t);
	}, w = (e, t, n, r, i, a, o, s, c) => {
		if (t.type === "svg" ? o = "svg" : t.type === "math" && (o = "mathml"), e == null) ee(t, n, r, i, a, o, s, c);
		else {
			let n = e.el && e.el._isVueCE ? e.el : null;
			try {
				n && n._beginPatch(), te(e, t, i, a, o, s, c);
			} finally {
				n && n._endPatch();
			}
		}
	}, ee = (e, t, n, r, i, a, s, u) => {
		let d, f, { props: m, shapeFlag: h, transition: g, dirs: _ } = e;
		if (d = e.el = l(e.type, a, m && m.is, m), h & 8 ? p(d, e.children) : h & 16 && D(e.children, d, null, r, i, ra(e, a), s, u), _ && Hn(e, null, r, "created"), E(d, e, e.scopeId, s, r), m) {
			for (let e in m) e !== "value" && !T(e) && c(d, e, null, m[e], a, r);
			"value" in m && c(d, "value", null, m.value, a), (f = m.onVnodeBeforeMount) && Ma(f, r, e);
		}
		_ && Hn(e, null, r, "beforeMount");
		let v = aa(i, g);
		v && g.beforeEnter(d), o(d, t, n), ((f = m && m.onVnodeMounted) || v || _) && ea(() => {
			try {
				f && Ma(f, r, e), v && g.enter(d), _ && Hn(e, null, r, "mounted");
			} finally {}
		}, i);
	}, E = (e, t, n, r, i) => {
		if (n && g(e, n), r) for (let t = 0; t < r.length; t++) g(e, r[t]);
		if (i) {
			let n = i.subTree;
			if (t === n || da(n.type) && (n.ssContent === t || n.ssFallback === t)) {
				let t = i.vnode;
				E(e, t, t.scopeId, t.slotScopeIds, i.parent);
			}
		}
	}, D = (e, t, n, r, i, a, o, s, c = 0) => {
		for (let l = c; l < e.length; l++) {
			let c = e[l] = s ? Aa(e[l]) : ka(e[l]);
			v(null, c, t, n, r, i, a, o, s);
		}
	}, te = (e, n, r, i, a, o, s) => {
		let l = n.el = e.el, { patchFlag: u, dynamicChildren: d, dirs: f } = n;
		u |= e.patchFlag & 16;
		let m = e.props || t, h = n.props || t, g;
		if (r && ia(r, !1), (g = h.onVnodeBeforeUpdate) && Ma(g, r, n, e), f && Hn(n, e, r, "beforeUpdate"), r && ia(r, !0), d && (!e.dynamicChildren || e.dynamicChildren.length !== d.length) && (u = 0, s = !1, d = null), (m.innerHTML && h.innerHTML == null || m.textContent && h.textContent == null) && p(l, ""), d ? ne(e.dynamicChildren, d, l, r, i, ra(n, a), o) : s || ue(e, n, l, null, r, i, ra(n, a), o, !1), u > 0) {
			if (u & 16) re(l, m, h, r, a);
			else if (u & 2 && m.class !== h.class && c(l, "class", null, h.class, a), u & 4 && c(l, "style", m.style, h.style, a), u & 8) {
				let e = n.dynamicProps;
				for (let t = 0; t < e.length; t++) {
					let n = e[t], i = m[n], o = h[n];
					(o !== i || n === "value") && c(l, n, i, o, a, r);
				}
			}
			u & 1 && e.children !== n.children && p(l, n.children);
		} else !s && d == null && re(l, m, h, r, a);
		((g = h.onVnodeUpdated) || f) && ea(() => {
			g && Ma(g, r, n, e), f && Hn(n, e, r, "updated");
		}, i);
	}, ne = (e, t, n, r, i, a, o) => {
		for (let s = 0; s < t.length; s++) {
			let c = e[s], l = t[s], u = c.el && (c.type === V || !Ca(c, l) || c.shapeFlag & 198) ? m(c.el) : n;
			v(c, l, u, null, r, i, a, o, !0);
		}
	}, re = (e, n, r, i, a) => {
		if (n !== r) {
			if (n !== t) for (let t in n) !T(t) && !(t in r) && c(e, t, n[t], null, a, i);
			for (let t in r) {
				if (T(t)) continue;
				let o = r[t], s = n[t];
				o !== s && t !== "value" && c(e, t, s, o, a, i);
			}
			"value" in r && c(e, "value", n.value, r.value, a);
		}
	}, ie = (e, t, n, r, i, a, s, c, l) => {
		let d = t.el = e ? e.el : u(""), f = t.anchor = e ? e.anchor : u(""), { patchFlag: p, dynamicChildren: m, slotScopeIds: h } = t;
		h && (c = c ? c.concat(h) : h), e == null ? (o(d, n, r), o(f, n, r), D(t.children || [], n, f, i, a, s, c, l)) : p > 0 && p & 64 && m && e.dynamicChildren && e.dynamicChildren.length === m.length ? (ne(e.dynamicChildren, m, n, i, a, s, c), (t.key != null || i && t === i.subTree) && oa(e, t, !0)) : ue(e, t, n, f, i, a, s, c, l);
	}, O = (e, t, n, r, i, a, o, s, c) => {
		t.slotScopeIds = s, e == null ? t.shapeFlag & 512 ? i.ctx.activate(t, n, r, o, c) : oe(t, n, r, i, a, o, c) : k(e, t, c);
	}, oe = (e, t, n, r, i, a, o) => {
		let s = e.component = Fa(e, r, i);
		if (Er(e) && (s.ctx.renderer = M), Wa(s, !1, o), s.asyncDep) {
			if (i && i.registerDep(s, se, o), !e.el) {
				let r = s.subTree = K(ma);
				b(null, r, t, n), e.placeholder = r.el;
			}
		} else se(s, e, t, n, i, a, o);
	}, k = (e, t, n) => {
		let r = t.component = e.component;
		if (Mi(e, t, n)) {
			if (r.asyncDep && !r.asyncResolved) {
				le(r, t, n);
				return;
			}
			r.next = t, r.update();
		} else t.el = e.el, r.vnode = t;
	}, se = (e, t, n, r, i, a, o) => {
		let s = () => {
			if (e.isMounted) {
				let { next: t, bu: n, u: r, parent: s, vnode: c } = e;
				{
					let n = ca(e);
					if (n) {
						t && (t.el = c.el, le(e, t, o)), n.asyncDep.then(() => {
							ea(() => {
								e.isUnmounted || l();
							}, i);
						});
						return;
					}
				}
				let u = t, d;
				ia(e, !1), t ? (t.el = c.el, le(e, t, o)) : t = c, n && ae(n), (d = t.props && t.props.onVnodeBeforeUpdate) && Ma(d, s, t, c), ia(e, !0);
				let f = ki(e), p = e.subTree;
				e.subTree = f, v(p, f, m(p.el), _e(p), e, i, a), t.el = f.el, u === null && Fi(e, f.el), r && ea(r, i), (d = t.props && t.props.onVnodeUpdated) && ea(() => Ma(d, s, t, c), i);
			} else {
				let o, { el: s, props: c } = t, { bm: l, m: u, parent: d, root: f, type: p } = e, m = Tr(t);
				if (ia(e, !1), l && ae(l), !m && (o = c && c.onVnodeBeforeMount) && Ma(o, d, t), ia(e, !0), s && xe) {
					let t = () => {
						e.subTree = ki(e), xe(s, e.subTree, e, i, null);
					};
					m && p.__asyncHydrate ? p.__asyncHydrate(s, e, t) : t();
				} else {
					f.ce && f.ce._hasShadowRoot() && f.ce._injectChildStyle(p, e.parent ? e.parent.type : void 0);
					let o = e.subTree = ki(e);
					v(null, o, n, r, e, i, a), t.el = o.el;
				}
				if (u && ea(u, i), !m && (o = c && c.onVnodeMounted)) {
					let e = t;
					ea(() => Ma(o, d, e), i);
				}
				(t.shapeFlag & 256 || d && Tr(d.vnode) && d.vnode.shapeFlag & 256) && e.a && ea(e.a, i), e.isMounted = !0, t = n = r = null;
			}
		};
		e.scope.on();
		let c = e.effect = new Oe(s);
		e.scope.off();
		let l = e.update = c.run.bind(c), u = e.job = c.runIfDirty.bind(c);
		u.i = e, u.id = e.uid, c.scheduler = () => Mn(u), ia(e, !0), l();
	}, le = (e, t, n) => {
		t.component = e;
		let r = e.vnode.props;
		e.vnode = t, e.next = null, Bi(e, t.props, r, n), $i(e, t.children, n), Ue(), Fn(e), We();
	}, ue = (e, t, n, r, i, a, o, s, c = !1) => {
		let l = e && e.children, u = e ? e.shapeFlag : 0, d = t.children, { patchFlag: f, shapeFlag: m } = t;
		if (f > 0) {
			if (f & 128) {
				fe(l, d, n, r, i, a, o, s, c);
				return;
			}
			if (f & 256) {
				de(l, d, n, r, i, a, o, s, c);
				return;
			}
		}
		m & 8 ? (u & 16 && ge(l, i, a), d !== l && p(n, d)) : u & 16 ? m & 16 ? fe(l, d, n, r, i, a, o, s, c) : ge(l, i, a, !0) : (u & 8 && p(n, ""), m & 16 && D(d, n, r, i, a, o, s, c));
	}, de = (e, t, r, i, a, o, s, c, l) => {
		e ||= n, t ||= n;
		let u = e.length, d = t.length, f = Math.min(u, d), p;
		for (p = 0; p < f; p++) {
			let n = t[p] = l ? Aa(t[p]) : ka(t[p]);
			v(e[p], n, r, null, a, o, s, c, l);
		}
		u > d ? ge(e, a, o, !0, !1, f) : D(t, r, i, a, o, s, c, l, f);
	}, fe = (e, t, r, i, a, o, s, c, l) => {
		let u = 0, d = t.length, f = e.length - 1, p = d - 1;
		for (; u <= f && u <= p;) {
			let n = e[u], i = t[u] = l ? Aa(t[u]) : ka(t[u]);
			if (Ca(n, i)) v(n, i, r, null, a, o, s, c, l);
			else break;
			u++;
		}
		for (; u <= f && u <= p;) {
			let n = e[f], i = t[p] = l ? Aa(t[p]) : ka(t[p]);
			if (Ca(n, i)) v(n, i, r, null, a, o, s, c, l);
			else break;
			f--, p--;
		}
		if (u > f) {
			if (u <= p) {
				let e = p + 1, n = e < d ? t[e].el : i;
				for (; u <= p;) v(null, t[u] = l ? Aa(t[u]) : ka(t[u]), r, n, a, o, s, c, l), u++;
			}
		} else if (u > p) for (; u <= f;) A(e[u], a, o, !0), u++;
		else {
			let m = u, h = u, g = /* @__PURE__ */ new Map();
			for (u = h; u <= p; u++) {
				let e = t[u] = l ? Aa(t[u]) : ka(t[u]);
				e.key != null && g.set(e.key, u);
			}
			let _, y = 0, b = p - h + 1, x = !1, S = 0, C = Array(b);
			for (u = 0; u < b; u++) C[u] = 0;
			for (u = m; u <= f; u++) {
				let n = e[u];
				if (y >= b) {
					A(n, a, o, !0);
					continue;
				}
				let i;
				if (n.key != null) i = g.get(n.key);
				else for (_ = h; _ <= p; _++) if (C[_ - h] === 0 && Ca(n, t[_])) {
					i = _;
					break;
				}
				i === void 0 ? A(n, a, o, !0) : (C[i - h] = u + 1, i >= S ? S = i : x = !0, v(n, t[i], r, null, a, o, s, c, l), y++);
			}
			let w = x ? sa(C) : n;
			for (_ = w.length - 1, u = b - 1; u >= 0; u--) {
				let e = h + u, n = t[e], f = t[e + 1], p = e + 1 < d ? f.el || ua(f) : i;
				C[u] === 0 ? v(null, n, r, p, a, o, s, c, l) : x && (_ < 0 || u !== w[_] ? pe(n, r, p, 2) : _--);
			}
		}
	}, pe = (e, t, n, r, i = null) => {
		let { el: a, type: c, transition: l, children: u, shapeFlag: d } = e;
		if (d & 6) {
			pe(e.component.subTree, t, n, r);
			return;
		}
		if (d & 128) {
			e.suspense.move(t, n, r);
			return;
		}
		if (d & 64) {
			c.move(e, t, n, M);
			return;
		}
		if (c === V) {
			o(a, t, n);
			for (let e = 0; e < u.length; e++) pe(u[e], t, n, r);
			o(e.anchor, t, n);
			return;
		}
		if (c === ha) {
			S(e, t, n);
			return;
		}
		if (r !== 2 && d & 1 && l) {
			if (r === 0) l.persisted && !a[mr] ? o(a, t, n) : (l.beforeEnter(a), o(a, t, n), ea(() => l.enter(a), i));
			else {
				let { leave: r, delayLeave: i, afterLeave: c } = l, u = () => {
					e.ctx.isUnmounted ? s(a) : o(a, t, n);
				}, d = () => {
					let e = a._isLeaving || !!a[mr];
					a._isLeaving && a[mr](!0), l.persisted && !e ? u() : r(a, () => {
						u(), c && c();
					});
				};
				i ? i(a, u, d) : d();
			}
		} else o(a, t, n);
	}, A = (e, t, n, r = !1, i = !1) => {
		let { type: a, props: o, ref: s, children: c, dynamicChildren: l, shapeFlag: u, patchFlag: d, dirs: f, cacheIndex: p, memo: m } = e;
		if (d === -2 && (i = !1), s != null && (Ue(), Cr(s, null, n, e, !0), We()), p != null && (t.renderCache[p] = void 0), u & 256) {
			t.ctx.deactivate(e);
			return;
		}
		let h = u & 1 && f, g = !Tr(e), _;
		if (g && (_ = o && o.onVnodeBeforeUnmount) && Ma(_, t, e), u & 6) he(e.component, n, r);
		else {
			if (u & 128) {
				e.suspense.unmount(n, r);
				return;
			}
			h && Hn(e, null, t, "beforeUnmount"), u & 64 ? e.type.remove(e, t, n, M, r) : l && !l.hasOnce && (a !== V || d > 0 && d & 64) ? ge(l, t, n, !1, !0) : (a === V && d & 384 || !i && u & 16) && ge(c, t, n), r && j(e);
		}
		let v = m != null && p == null;
		(g && (_ = o && o.onVnodeUnmounted) || h || v) && ea(() => {
			_ && Ma(_, t, e), h && Hn(e, null, t, "unmounted"), v && (e.el = null);
		}, n);
	}, j = (e) => {
		let { type: t, el: n, anchor: r, transition: i } = e;
		if (t === V) {
			me(n, r);
			return;
		}
		if (t === ha) {
			C(e);
			return;
		}
		let a = () => {
			s(n), i && !i.persisted && i.afterLeave && i.afterLeave();
		};
		if (e.shapeFlag & 1 && i && !i.persisted) {
			let { leave: t, delayLeave: r } = i, o = () => t(n, a);
			r ? r(e.el, a, o) : o();
		} else a();
	}, me = (e, t) => {
		let n;
		for (; e !== t;) n = h(e), s(e), e = n;
		s(t);
	}, he = (e, t, n) => {
		let { bum: r, scope: i, job: a, subTree: o, um: s, m: c, a: l } = e;
		la(c), la(l), r && ae(r), i.stop(), a && (a.flags |= 8, A(o, e, t, n)), s && ea(s, t), ea(() => {
			e.isUnmounted = !0;
		}, t);
	}, ge = (e, t, n, r = !1, i = !1, a = 0) => {
		for (let o = a; o < e.length; o++) A(e[o], t, n, r, i);
	}, _e = (e) => {
		if (e.shapeFlag & 6) return _e(e.component.subTree);
		if (e.shapeFlag & 128) return e.suspense.next();
		let t = h(e.anchor || e.el), n = t && t[tr];
		return n ? h(n) : t;
	}, ve = !1, ye = (e, t, n) => {
		let r;
		e == null ? t._vnode && (A(t._vnode, null, null, !0), r = t._vnode.component) : v(t._vnode || null, e, t, null, null, null, n), t._vnode = e, ve ||= (ve = !0, Fn(r), In(), !1);
	}, M = {
		p: v,
		um: A,
		m: pe,
		r: j,
		mt: oe,
		mc: D,
		pc: ue,
		pbc: ne,
		n: _e,
		o: e
	}, be, xe;
	return i && ([be, xe] = i(M)), {
		render: ye,
		hydrate: be,
		createApp: xi(ye, be)
	};
}
function ra({ type: e, props: t }, n) {
	return n === "svg" && e === "foreignObject" || n === "mathml" && e === "annotation-xml" && t && t.encoding && t.encoding.includes("html") ? void 0 : n;
}
function ia({ effect: e, job: t }, n) {
	n ? (e.flags |= 32, t.flags |= 4) : (e.flags &= -33, t.flags &= -5);
}
function aa(e, t) {
	return (!e || e && !e.pendingBranch) && t && !t.persisted;
}
function oa(e, t, n = !1) {
	let r = e.children, i = t.children;
	if (d(r) && d(i)) for (let e = 0; e < r.length; e++) {
		let t = r[e], a = i[e];
		a.shapeFlag & 1 && !a.dynamicChildren && ((a.patchFlag <= 0 || a.patchFlag === 32) && (a = i[e] = Aa(i[e]), a.el = t.el), !n && a.patchFlag !== -2 && oa(t, a)), a.type === pa && (a.patchFlag === -1 && (a = i[e] = Aa(a)), a.el = t.el), a.type === ma && !a.el && (a.el = t.el);
	}
}
function sa(e) {
	let t = e.slice(), n = [0], r, i, a, o, s, c = e.length;
	for (r = 0; r < c; r++) {
		let c = e[r];
		if (c !== 0) {
			if (i = n[n.length - 1], e[i] < c) {
				t[r] = i, n.push(r);
				continue;
			}
			for (a = 0, o = n.length - 1; a < o;) s = a + o >> 1, e[n[s]] < c ? a = s + 1 : o = s;
			c < e[n[a]] && (a > 0 && (t[r] = n[a - 1]), n[a] = r);
		}
	}
	for (a = n.length, o = n[a - 1]; a-- > 0;) n[a] = o, o = t[o];
	return n;
}
function ca(e) {
	let t = e.subTree.component;
	if (t) return t.asyncDep && !t.asyncResolved ? t : ca(t);
}
function la(e) {
	if (e) for (let t = 0; t < e.length; t++) e[t].flags |= 8;
}
function ua(e) {
	if (e.placeholder) return e.placeholder;
	let t = e.component;
	return t ? ua(t.subTree) : null;
}
var da = (e) => e.__isSuspense;
function fa(e, t) {
	t && t.pendingBranch ? d(e) ? t.effects.push(...e) : t.effects.push(e) : Pn(e);
}
var V = /* @__PURE__ */ Symbol.for("v-fgt"), pa = /* @__PURE__ */ Symbol.for("v-txt"), ma = /* @__PURE__ */ Symbol.for("v-cmt"), ha = /* @__PURE__ */ Symbol.for("v-stc"), ga = [], _a = null;
function H(e = !1) {
	ga.push(_a = e ? null : []);
}
function va() {
	ga.pop(), _a = ga[ga.length - 1] || null;
}
var ya = 1;
function ba(e, t = !1) {
	ya += e, e < 0 && _a && t && (_a.hasOnce = !0);
}
function xa(e) {
	return e.dynamicChildren = ya > 0 ? _a || n : null, va(), ya > 0 && _a && _a.push(e), e;
}
function U(e, t, n, r, i, a) {
	return xa(G(e, t, n, r, i, a, !0));
}
function W(e, t, n, r, i) {
	return xa(K(e, t, n, r, i, !0));
}
function Sa(e) {
	return e ? e.__v_isVNode === !0 : !1;
}
function Ca(e, t) {
	return e.type === t.type && e.key === t.key;
}
var wa = ({ key: e }) => e ?? null, Ta = ({ ref: e, ref_key: t, ref_for: n }) => (typeof e == "number" && (e = "" + e), e == null ? null : g(e) || /* @__PURE__ */ F(e) || h(e) ? {
	i: zn,
	r: e,
	k: t,
	f: !!n
} : e);
function G(e, t = null, n = null, r = 0, i = null, a = e === V ? 0 : 1, o = !1, s = !1) {
	let c = {
		__v_isVNode: !0,
		__v_skip: !0,
		type: e,
		props: t,
		key: t && wa(t),
		ref: t && Ta(t),
		scopeId: Bn,
		slotScopeIds: null,
		children: n,
		component: null,
		suspense: null,
		ssContent: null,
		ssFallback: null,
		dirs: null,
		transition: null,
		el: null,
		anchor: null,
		target: null,
		targetStart: null,
		targetAnchor: null,
		staticCount: 0,
		shapeFlag: a,
		patchFlag: r,
		dynamicProps: i,
		dynamicChildren: null,
		appContext: null,
		ctx: zn
	};
	return s ? (ja(c, n), a & 128 && e.normalize(c)) : n && (c.shapeFlag |= g(n) ? 8 : 16), ya > 0 && !o && _a && (c.patchFlag > 0 || a & 6) && c.patchFlag !== 32 && _a.push(c), c;
}
var K = Ea;
function Ea(e, t = null, n = null, r = 0, i = null, a = !1) {
	if ((!e || e === Wr) && (e = ma), Sa(e)) {
		let r = Oa(e, t, !0);
		return n && ja(r, n), ya > 0 && !a && _a && (r.shapeFlag & 6 ? _a[_a.indexOf(e)] = r : _a.push(r)), r.patchFlag = -2, r;
	}
	if (eo(e) && (e = e.__vccOpts), t) {
		t = Da(t);
		let { class: e, style: n } = t;
		e && !g(e) && (t.class = A(e)), v(n) && (/* @__PURE__ */ Kt(n) && !d(n) && (n = s({}, n)), t.style = le(n));
	}
	let o = g(e) ? 1 : da(e) ? 128 : nr(e) ? 64 : v(e) ? 4 : h(e) ? 2 : 0;
	return G(e, t, n, r, i, o, a, !0);
}
function Da(e) {
	return e ? /* @__PURE__ */ Kt(e) || Ri(e) ? s({}, e) : e : null;
}
function Oa(e, t, n = !1, r = !1) {
	let { props: i, ref: a, patchFlag: o, children: s, transition: c } = e, l = t ? Y(i || {}, t) : i, u = {
		__v_isVNode: !0,
		__v_skip: !0,
		type: e.type,
		props: l,
		key: l && wa(l),
		ref: t && t.ref ? n && a ? d(a) ? a.concat(Ta(t)) : [a, Ta(t)] : Ta(t) : a,
		scopeId: e.scopeId,
		slotScopeIds: e.slotScopeIds,
		children: s,
		target: e.target,
		targetStart: e.targetStart,
		targetAnchor: e.targetAnchor,
		staticCount: e.staticCount,
		shapeFlag: e.shapeFlag,
		patchFlag: t && e.type !== V ? o === -1 ? 16 : o | 16 : o,
		dynamicProps: e.dynamicProps,
		dynamicChildren: e.dynamicChildren,
		appContext: e.appContext,
		dirs: e.dirs,
		transition: c,
		component: e.component,
		suspense: e.suspense,
		ssContent: e.ssContent && Oa(e.ssContent),
		ssFallback: e.ssFallback && Oa(e.ssFallback),
		placeholder: e.placeholder,
		el: e.el,
		anchor: e.anchor,
		ctx: e.ctx,
		ce: e.ce
	};
	return c && r && _r(u, c.clone(u)), u;
}
function q(e = " ", t = 0) {
	return K(pa, null, e, t);
}
function J(e = "", t = !1) {
	return t ? (H(), W(ma, null, e)) : K(ma, null, e);
}
function ka(e) {
	return e == null || typeof e == "boolean" ? K(ma) : d(e) ? K(V, null, e.slice()) : Sa(e) ? Aa(e) : K(pa, null, String(e));
}
function Aa(e) {
	return e.el === null && e.patchFlag !== -1 || e.memo ? e : Oa(e);
}
function ja(e, t) {
	let n = 0, { shapeFlag: r } = e;
	if (t == null) t = null;
	else if (d(t)) n = 16;
	else if (typeof t == "object") {
		if (r & 65) {
			let n = t.default;
			n && (n._c && (n._d = !1), ja(e, n()), n._c && (n._d = !0));
			return;
		}
		{
			n = 32;
			let r = t._;
			!r && !Ri(t) ? t._ctx = zn : r === 3 && zn && (zn.slots._ === 1 ? t._ = 1 : (t._ = 2, e.patchFlag |= 1024));
		}
	} else if (h(t)) {
		if (r & 65) {
			ja(e, { default: t });
			return;
		}
		t = {
			default: t,
			_ctx: zn
		}, n = 32;
	} else t = String(t), r & 64 ? (n = 16, t = [q(t)]) : n = 8;
	e.children = t, e.shapeFlag |= n;
}
function Y(...e) {
	let t = {};
	for (let n = 0; n < e.length; n++) {
		let r = e[n];
		for (let e in r) if (e === "class") t.class !== r.class && (t.class = A([t.class, r.class]));
		else if (e === "style") t.style = le([t.style, r.style]);
		else if (a(e)) {
			let n = t[e], i = r[e];
			i && n !== i && !(d(n) && n.includes(i)) ? t[e] = n ? [].concat(n, i) : i : i == null && n == null && !o(e) && (t[e] = i);
		} else e !== "" && (t[e] = r[e]);
	}
	return t;
}
function Ma(e, t, n, r = null) {
	bn(e, t, 7, [n, r]);
}
var Na = yi(), Pa = 0;
function Fa(e, n, r) {
	let i = e.type, a = (n ? n.appContext : e.appContext) || Na, o = {
		uid: Pa++,
		vnode: e,
		type: i,
		parent: n,
		appContext: a,
		root: null,
		next: null,
		subTree: null,
		effect: null,
		update: null,
		job: null,
		scope: new Ce(!0),
		render: null,
		proxy: null,
		exposed: null,
		exposeProxy: null,
		withProxy: null,
		provides: n ? n.provides : Object.create(a.provides),
		ids: n ? n.ids : [
			"",
			0,
			0
		],
		accessCache: null,
		renderCache: [],
		components: null,
		directives: null,
		propsOptions: Wi(i, a),
		emitsOptions: Di(i, a),
		emit: null,
		emitted: null,
		propsDefaults: t,
		inheritAttrs: i.inheritAttrs,
		ctx: t,
		data: t,
		props: t,
		attrs: t,
		slots: t,
		refs: t,
		setupState: t,
		setupContext: null,
		suspense: r,
		suspenseId: r ? r.pendingId : 0,
		asyncDep: null,
		asyncResolved: !1,
		isMounted: !1,
		isUnmounted: !1,
		isDeactivated: !1,
		bc: null,
		c: null,
		bm: null,
		m: null,
		bu: null,
		u: null,
		um: null,
		bum: null,
		da: null,
		a: null,
		rtg: null,
		rtc: null,
		ec: null,
		sp: null
	};
	return o.ctx = { _: o }, o.root = n ? n.root : o, o.emit = Ti.bind(null, o), e.ce && e.ce(o), o;
}
var Ia = null, La = () => Ia || zn, Ra, za;
{
	let e = ce(), t = (t, n) => {
		let r;
		return (r = e[t]) || (r = e[t] = []), r.push(n), (e) => {
			r.length > 1 ? r.forEach((t) => t(e)) : r[0](e);
		};
	};
	Ra = t("__VUE_INSTANCE_SETTERS__", (e) => Ia = e), za = t("__VUE_SSR_SETTERS__", (e) => Ua = e);
}
var Ba = (e) => {
	let t = Ia;
	return Ra(e), e.scope.on(), () => {
		e.scope.off(), Ra(t);
	};
}, Va = () => {
	Ia && Ia.scope.off(), Ra(null);
};
function Ha(e) {
	return e.vnode.shapeFlag & 4;
}
var Ua = !1;
function Wa(e, t = !1, n = !1) {
	t && za(t);
	let { props: r, children: i } = e.vnode, a = Ha(e);
	zi(e, r, a, t), Qi(e, i, n || t);
	let o = a ? Ga(e, t) : void 0;
	return t && za(!1), o;
}
function Ga(e, t) {
	let n = e.type;
	e.accessCache = /* @__PURE__ */ Object.create(null), e.proxy = new Proxy(e.ctx, $r);
	let { setup: r } = n;
	if (r) {
		Ue();
		let n = e.setupContext = r.length > 1 ? Za(e) : null, i = Ba(e), a = yn(r, e, 0, [e.props, n]), o = y(a);
		if (We(), i(), (o || e.sp) && !Tr(e) && yr(e), o) {
			if (a.then(Va, Va), t) return a.then((n) => {
				za(!0);
				try {
					Ka(e, n, t);
				} finally {
					za(!1);
				}
			}).catch((t) => {
				xn(t, e, 0);
			});
			e.asyncDep = a;
		} else Ka(e, a, t);
	} else Ya(e, t);
}
function Ka(e, t, n) {
	h(t) ? e.type.__ssrInlineRender ? e.ssrRender = t : e.render = t : v(t) && (e.setupState = nn(t)), Ya(e, n);
}
var qa, Ja;
function Ya(e, t, n) {
	let i = e.type;
	if (!e.render) {
		if (!t && qa && !i.render) {
			let t = i.template || li(e).template;
			if (t) {
				let { isCustomElement: n, compilerOptions: r } = e.appContext.config, { delimiters: a, compilerOptions: o } = i;
				i.render = qa(t, s(s({
					isCustomElement: n,
					delimiters: a
				}, r), o));
			}
		}
		e.render = i.render || r, Ja && Ja(e);
	}
	{
		let t = Ba(e);
		Ue();
		try {
			ai(e);
		} finally {
			We(), t();
		}
	}
}
var Xa = { get(e, t) {
	return et(e, "get", ""), e[t];
} };
function Za(e) {
	return {
		attrs: new Proxy(e.attrs, Xa),
		slots: e.slots,
		emit: e.emit,
		expose: (t) => {
			e.exposed = t || {};
		}
	};
}
function Qa(e) {
	return e.exposed ? e.exposeProxy ||= new Proxy(nn(qt(e.exposed)), {
		get(t, n) {
			if (n in t) return t[n];
			if (n in Zr) return Zr[n](e);
		},
		has(e, t) {
			return t in e || t in Zr;
		}
	}) : e.proxy;
}
function $a(e, t = !0) {
	return h(e) ? e.displayName || e.name : e.name || t && e.__name;
}
function eo(e) {
	return h(e) && "__vccOpts" in e;
}
var X = (e, t) => /* @__PURE__ */ fn(e, t, Ua);
function to(e, t, n) {
	try {
		ba(-1);
		let r = arguments.length;
		return r === 2 ? v(t) && !d(t) ? Sa(t) ? K(e, null, [t]) : K(e, t) : K(e, null, t) : (r > 3 ? n = Array.prototype.slice.call(arguments, 2) : r === 3 && Sa(n) && (n = [n]), K(e, t, n));
	} finally {
		ba(1);
	}
}
var no = "3.5.41", ro = void 0, io = typeof window < "u" && window.trustedTypes;
if (io) try {
	ro = /* @__PURE__ */ io.createPolicy("vue", { createHTML: (e) => e });
} catch {}
var ao = ro ? (e) => ro.createHTML(e) : (e) => e, oo = "http://www.w3.org/2000/svg", so = "http://www.w3.org/1998/Math/MathML", co = typeof document < "u" ? document : null, lo = co && /* @__PURE__ */ co.createElement("template"), uo = {
	insert: (e, t, n) => {
		t.insertBefore(e, n || null);
	},
	remove: (e) => {
		let t = e.parentNode;
		t && t.removeChild(e);
	},
	createElement: (e, t, n, r) => {
		let i = t === "svg" ? co.createElementNS(oo, e) : t === "mathml" ? co.createElementNS(so, e) : n ? co.createElement(e, { is: n }) : co.createElement(e);
		return e === "select" && r && r.multiple != null && i.setAttribute("multiple", r.multiple), i;
	},
	createText: (e) => co.createTextNode(e),
	createComment: (e) => co.createComment(e),
	setText: (e, t) => {
		e.nodeValue = t;
	},
	setElementText: (e, t) => {
		e.textContent = t;
	},
	parentNode: (e) => e.parentNode,
	nextSibling: (e) => e.nextSibling,
	querySelector: (e) => co.querySelector(e),
	setScopeId(e, t) {
		e.setAttribute(t, "");
	},
	insertStaticContent(e, t, n, r, i, a) {
		let o = n ? n.previousSibling : t.lastChild;
		if (i && (i === a || i.nextSibling)) for (; t.insertBefore(i.cloneNode(!0), n), !(i === a || !(i = i.nextSibling)););
		else {
			lo.innerHTML = ao(r === "svg" ? `<svg>${e}</svg>` : r === "mathml" ? `<math>${e}</math>` : e);
			let i = lo.content;
			if (r === "svg" || r === "mathml") {
				let e = i.firstChild;
				for (; e.firstChild;) i.appendChild(e.firstChild);
				i.removeChild(e);
			}
			t.insertBefore(i, n);
		}
		return [o ? o.nextSibling : t.firstChild, n ? n.previousSibling : t.lastChild];
	}
}, fo = /* @__PURE__ */ Symbol("_vtc");
function po(e, t, n) {
	let r = e[fo];
	r && (t = (t ? [t, ...r] : [...r]).join(" ")), t == null ? e.removeAttribute("class") : n ? e.setAttribute("class", t) : e.className = t;
}
var mo = /* @__PURE__ */ Symbol("_vod"), ho = /* @__PURE__ */ Symbol("_vsh"), go = /* @__PURE__ */ Symbol(""), _o = /(?:^|;)\s*display\s*:/;
function vo(e, t, n) {
	let r = e.style, i = g(n), a = !1;
	if (n && !i) {
		if (t) {
			if (g(t)) for (let e of t.split(";")) {
				let t = e.slice(0, e.indexOf(":")).trim();
				n[t] ?? bo(r, t, "");
			}
			else for (let e in t) n[e] ?? bo(r, e, "");
		}
		for (let i in n) {
			i === "display" && (a = !0);
			let o = n[i];
			o == null ? bo(r, i, "") : wo(e, i, !g(t) && t ? t[i] : void 0, o) || bo(r, i, o);
		}
	} else if (i) {
		if (t !== n) {
			let e = r[go];
			e && (n += ";" + e), r.cssText = n, a = _o.test(n);
		}
	} else t && e.removeAttribute("style");
	mo in e && (e[mo] = a ? r.display : "", e[ho] && (r.display = "none"));
}
var yo = /\s*!important$/;
function bo(e, t, n) {
	if (d(n)) n.forEach((n) => bo(e, t, n));
	else if (n ??= "", t.startsWith("--")) e.setProperty(t, n);
	else {
		let r = Co(e, t);
		yo.test(n) ? e.setProperty(ne(r), n.replace(yo, ""), "important") : e[r] = n;
	}
}
var xo = [
	"Webkit",
	"Moz",
	"ms"
], So = {};
function Co(e, t) {
	let n = So[t];
	if (n) return n;
	let r = D(t);
	if (r !== "filter" && r in e) return So[t] = r;
	r = re(r);
	for (let n = 0; n < xo.length; n++) {
		let i = xo[n] + r;
		if (i in e) return So[t] = i;
	}
	return t;
}
function wo(e, t, n, r) {
	return e.tagName === "TEXTAREA" && (t === "width" || t === "height") && g(r) && n === r;
}
var To = "http://www.w3.org/1999/xlink";
function Eo(e, t, n, r, i, a = he(t)) {
	r && t.startsWith("xlink:") ? n == null ? e.removeAttributeNS(To, t.slice(6, t.length)) : e.setAttributeNS(To, t, n) : n == null || a && !ge(n) ? e.removeAttribute(t) : e.setAttribute(t, a ? "" : _(n) ? String(n) : n);
}
function Do(e, t, n, r, i) {
	if (t === "innerHTML" || t === "textContent") {
		n != null && (e[t] = t === "innerHTML" ? ao(n) : n);
		return;
	}
	let a = e.tagName;
	if (t === "value" && a !== "PROGRESS" && !a.includes("-")) {
		let r = a === "OPTION" ? e.getAttribute("value") || "" : e.value, i = n == null ? e.type === "checkbox" ? "on" : "" : String(n);
		(r !== i || !("_value" in e)) && (e.value = i), n ?? e.removeAttribute(t), e._value = n;
		return;
	}
	let o = !1;
	if (n === "" || n == null) {
		let r = typeof e[t];
		r === "boolean" ? n = ge(n) : n == null && r === "string" ? (n = "", o = !0) : r === "number" && (n = 0, o = !0);
	}
	try {
		e[t] = n;
	} catch {}
	o && e.removeAttribute(i || t);
}
function Oo(e, t, n, r) {
	e.addEventListener(t, n, r);
}
function ko(e, t, n, r) {
	e.removeEventListener(t, n, r);
}
var Ao = /* @__PURE__ */ Symbol("_vei");
function jo(e, t, n, r, i = null) {
	let a = e[Ao] || (e[Ao] = {}), o = a[t];
	if (r && o) o.value = r;
	else {
		let [n, s] = Po(t);
		r ? Oo(e, n, a[t] = Ro(r, i), s) : o && (ko(e, n, o, s), a[t] = void 0);
	}
}
var Mo = /(Once|Passive|Capture)$/, No = /^on:?(?:Once|Passive|Capture)$/;
function Po(e) {
	let t, n;
	for (; (n = e.match(Mo)) && !No.test(e);) t ||= {}, e = e.slice(0, e.length - n[1].length), t[n[1].toLowerCase()] = !0;
	return [e[2] === ":" ? e.slice(3) : ne(e.slice(2)), t];
}
var Fo = 0, Io = /* @__PURE__ */ Promise.resolve(), Lo = () => Fo ||= (Io.then(() => Fo = 0), Date.now());
function Ro(e, t) {
	let n = (e) => {
		if (!e._vts) e._vts = Date.now();
		else if (e._vts <= n.attached) return;
		let r = n.value;
		if (d(r)) {
			let n = e.stopImmediatePropagation;
			e.stopImmediatePropagation = () => {
				n.call(e), e._stopped = !0;
			};
			let i = r.slice(), a = [e];
			for (let n = 0; n < i.length && !e._stopped; n++) {
				let e = i[n];
				e && bn(e, t, 5, a);
			}
		} else bn(r, t, 5, [e]);
	};
	return n.value = e, n.attached = Lo(), n;
}
var zo = (e) => e.charCodeAt(0) === 111 && e.charCodeAt(1) === 110 && e.charCodeAt(2) > 96 && e.charCodeAt(2) < 123, Bo = (e, t, n, r, i, s) => {
	let c = i === "svg";
	t === "class" ? po(e, r, c) : t === "style" ? vo(e, n, r) : a(t) ? o(t) || jo(e, t, n, r, s) : (t[0] === "." ? (t = t.slice(1), !0) : t[0] === "^" ? (t = t.slice(1), !1) : Vo(e, t, r, c)) ? (Do(e, t, r), !e.tagName.includes("-") && (t === "value" || t === "checked" || t === "selected") && Eo(e, t, r, c, s, t !== "value")) : e._isVueCE && (Ho(e, t) || e._def.__asyncLoader && (/[A-Z]/.test(t) || !g(r))) ? Do(e, D(t), r, s, t) : (t === "true-value" ? e._trueValue = r : t === "false-value" && (e._falseValue = r), Eo(e, t, r, c));
};
function Vo(e, t, n, r) {
	if (r) return !!(t === "innerHTML" || t === "textContent" || t in e && zo(t) && h(n));
	if (t === "spellcheck" || t === "draggable" || t === "translate" || t === "autocorrect" || t === "sandbox" && e.tagName === "IFRAME" || t === "form" || t === "list" && e.tagName === "INPUT" || t === "type" && e.tagName === "TEXTAREA") return !1;
	if (t === "width" || t === "height") {
		let t = e.tagName;
		if (t === "IMG" || t === "VIDEO" || t === "CANVAS" || t === "SOURCE") return !1;
	}
	return zo(t) && g(n) ? !1 : t in e;
}
function Ho(e, t) {
	let n = e._def.props;
	if (!n) return !1;
	let r = D(t);
	return Array.isArray(n) ? n.some((e) => D(e) === r) : Object.keys(n).some((e) => D(e) === r);
}
var Uo = [
	"ctrl",
	"shift",
	"alt",
	"meta"
], Wo = {
	stop: (e) => e.stopPropagation(),
	prevent: (e) => e.preventDefault(),
	self: (e) => e.target !== e.currentTarget,
	ctrl: (e) => !e.ctrlKey,
	shift: (e) => !e.shiftKey,
	alt: (e) => !e.altKey,
	meta: (e) => !e.metaKey,
	left: (e) => "button" in e && e.button !== 0,
	middle: (e) => "button" in e && e.button !== 1,
	right: (e) => "button" in e && e.button !== 2,
	exact: (e, t) => Uo.some((n) => e[`${n}Key`] && !t.includes(n))
}, Go = (e, t) => {
	if (!e) return e;
	let n = e._withMods ||= {}, r = t.join(".");
	return n[r] || (n[r] = ((n, ...r) => {
		for (let e = 0; e < t.length; e++) {
			let r = Wo[t[e]];
			if (r && r(n, t)) return;
		}
		return e(n, ...r);
	}));
}, Ko = {
	esc: "escape",
	space: " ",
	up: "arrow-up",
	left: "arrow-left",
	right: "arrow-right",
	down: "arrow-down",
	delete: "backspace"
}, qo = (e, t) => {
	let n = e._withKeys ||= {}, r = t.join(".");
	return n[r] || (n[r] = ((n) => {
		if (!("key" in n)) return;
		let r = ne(n.key);
		if (t.some((e) => e === r || Ko[e] === r)) return e(n);
	}));
}, Jo = /* @__PURE__ */ s({ patchProp: Bo }, uo), Yo;
function Xo() {
	return Yo ||= ta(Jo);
}
var Zo = ((...e) => {
	let t = Xo().createApp(...e), { mount: n } = t;
	return t.mount = (e) => {
		let r = $o(e);
		if (!r) return;
		let i = t._component;
		!h(i) && !i.render && !i.template && (i.template = r.innerHTML), r.nodeType === 1 && (r.textContent = "");
		let a = n(r, !1, Qo(r));
		return r instanceof Element && (r.removeAttribute("v-cloak"), r.setAttribute("data-v-app", "")), a;
	}, t;
});
function Qo(e) {
	if (e instanceof SVGElement) return "svg";
	if (typeof MathMLElement == "function" && e instanceof MathMLElement) return "mathml";
}
function $o(e) {
	return g(e) ? document.querySelector(e) : e;
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/defu@6.1.7/node_modules/defu/dist/defu.mjs
function es(e) {
	if (typeof e != "object" || !e) return !1;
	let t = Object.getPrototypeOf(e);
	return t !== null && t !== Object.prototype && Object.getPrototypeOf(t) !== null || Symbol.iterator in e ? !1 : Symbol.toStringTag in e ? Object.prototype.toString.call(e) === "[object Module]" : !0;
}
function ts(e, t, n = ".", r) {
	if (!es(t)) return ts(e, {}, n, r);
	let i = { ...t };
	for (let t of Object.keys(e)) {
		if (t === "__proto__" || t === "constructor") continue;
		let a = e[t];
		a != null && (r && r(i, t, a, n) || (i[t] = Array.isArray(a) && Array.isArray(i[t]) ? [...a, ...i[t]] : es(a) && es(i[t]) ? ts(a, i[t], (n ? `${n}.` : "") + t.toString(), r) : a));
	}
	return i;
}
function ns(e) {
	return (...t) => t.reduce((t, n) => ts(t, n, "", e), {});
}
var rs = ns();
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/hookable@6.1.1/node_modules/hookable/dist/index.mjs
function is(e, t = {}, n) {
	for (let r in e) {
		let i = e[r], a = n ? `${n}:${r}` : r;
		typeof i == "object" && i ? is(i, t, a) : typeof i == "function" && (t[a] = i);
	}
	return t;
}
var as = /* @__PURE__ */ (() => {
	if (console.createTask) return console.createTask;
	let e = { run: (e) => e() };
	return () => e;
})();
function os(e, t, n, r) {
	for (let i = n; i < e.length; i += 1) try {
		let n = r ? r.run(() => e[i](...t)) : e[i](...t);
		if (n && typeof n.then == "function") return Promise.resolve(n).then(() => os(e, t, i + 1, r));
	} catch (e) {
		return Promise.reject(e);
	}
}
function ss(e, t, n) {
	if (e.length > 0) return os(e, t, 0, as(n));
}
function cs(e, t, n) {
	if (e.length > 0) {
		let r = as(n);
		return Promise.all(e.map((e) => r.run(() => e(...t))));
	}
}
function ls(e, t) {
	for (let n of [...e]) n(t);
}
var us = class {
	_hooks;
	_before;
	_after;
	_deprecatedHooks;
	_deprecatedMessages;
	constructor() {
		this._hooks = {}, this._before = void 0, this._after = void 0, this._deprecatedMessages = void 0, this._deprecatedHooks = {}, this.hook = this.hook.bind(this), this.callHook = this.callHook.bind(this), this.callHookWith = this.callHookWith.bind(this);
	}
	hook(e, t, n = {}) {
		if (!e || typeof t != "function") return () => {};
		let r = e, i;
		for (; this._deprecatedHooks[e];) i = this._deprecatedHooks[e], e = i.to;
		if (i && !n.allowDeprecated) {
			let e = i.message;
			e ||= `${r} hook has been deprecated` + (i.to ? `, please use ${i.to}` : ""), this._deprecatedMessages ||= /* @__PURE__ */ new Set(), this._deprecatedMessages.has(e) || (console.warn(e), this._deprecatedMessages.add(e));
		}
		if (!t.name) try {
			Object.defineProperty(t, "name", {
				get: () => "_" + e.replace(/\W+/g, "_") + "_hook_cb",
				configurable: !0
			});
		} catch {}
		return this._hooks[e] = this._hooks[e] || [], this._hooks[e].push(t), () => {
			t &&= (this.removeHook(e, t), void 0);
		};
	}
	hookOnce(e, t) {
		let n, r = (...e) => (typeof n == "function" && n(), n = void 0, r = void 0, t(...e));
		return n = this.hook(e, r), n;
	}
	removeHook(e, t) {
		let n = this._hooks[e];
		if (n) {
			let r = n.indexOf(t);
			r !== -1 && n.splice(r, 1), n.length === 0 && (this._hooks[e] = void 0);
		}
	}
	clearHook(e) {
		this._hooks[e] = void 0;
	}
	deprecateHook(e, t) {
		this._deprecatedHooks[e] = typeof t == "string" ? { to: t } : t;
		let n = this._hooks[e] || [];
		this._hooks[e] = void 0;
		for (let t of n) this.hook(e, t);
	}
	deprecateHooks(e) {
		for (let t in e) this.deprecateHook(t, e[t]);
	}
	addHooks(e) {
		let t = is(e), n = Object.keys(t).map((e) => this.hook(e, t[e]));
		return () => {
			for (let e of n) e();
			n.length = 0;
		};
	}
	removeHooks(e) {
		let t = is(e);
		for (let e in t) this.removeHook(e, t[e]);
	}
	removeAllHooks() {
		this._hooks = {};
	}
	callHook(e, ...t) {
		return this.callHookWith(ss, e, t);
	}
	callHookParallel(e, ...t) {
		return this.callHookWith(cs, e, t);
	}
	callHookWith(e, t, n) {
		let r = this._before || this._after ? {
			name: t,
			args: n,
			context: {}
		} : void 0;
		this._before && ls(this._before, r);
		let i = e(this._hooks[t] ? [...this._hooks[t]] : [], n, t);
		return i instanceof Promise ? i.finally(() => {
			this._after && r && ls(this._after, r);
		}) : (this._after && r && ls(this._after, r), i);
	}
	beforeEach(e) {
		return this._before = this._before || [], this._before.push(e), () => {
			if (this._before !== void 0) {
				let t = this._before.indexOf(e);
				t !== -1 && this._before.splice(t, 1);
			}
		};
	}
	afterEach(e) {
		return this._after = this._after || [], this._after.push(e), () => {
			if (this._after !== void 0) {
				let t = this._after.indexOf(e);
				t !== -1 && this._after.splice(t, 1);
			}
		};
	}
};
function ds() {
	return new us();
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/@vueuse+shared@14.3.0_vue@3.5.41_typescript@5.9.3_/node_modules/@vueuse/shared/dist/index.js
function fs(e, t) {
	return Te() ? (Ee(e, t), !0) : !1;
}
var ps = typeof window < "u" && typeof document < "u";
typeof WorkerGlobalScope < "u" && globalThis instanceof WorkerGlobalScope;
var ms = (e) => e !== void 0, hs = Object.prototype.toString, gs = (e) => hs.call(e) === "[object Object]", _s = () => {};
function vs(...e) {
	if (e.length !== 1) return /* @__PURE__ */ ln(...e);
	let t = e[0];
	return typeof t == "function" ? /* @__PURE__ */ Bt(an(() => ({
		get: t,
		set: _s
	}))) : /* @__PURE__ */ I(t);
}
function ys(e, t) {
	function n(...n) {
		return new Promise((r, i) => {
			Promise.resolve(e(() => t.apply(this, n), {
				fn: t,
				thisArg: this,
				args: n
			})).then(r).catch(i);
		});
	}
	return n;
}
function bs(e, t = {}) {
	let n, r, i = _s, a = (e) => {
		clearTimeout(e), i(), i = _s;
	}, o;
	return (s) => {
		let c = en(e), l = en(t.maxWait);
		return n && a(n), c <= 0 || l !== void 0 && l <= 0 ? (r &&= (a(r), void 0), Promise.resolve(s())) : new Promise((e, u) => {
			i = t.rejectOnCancel ? u : e, o = s, l && !r && (r = setTimeout(() => {
				n && a(n), r = void 0, e(o());
			}, l)), n = setTimeout(() => {
				r && a(r), r = void 0, e(s());
			}, c);
		});
	};
}
function xs(e) {
	return Array.isArray(e) ? e : [e];
}
function Ss(e) {
	if (!ps) return e;
	let t = 0, n, r, i = () => {
		--t, r && t <= 0 && (r.stop(), n = void 0, r = void 0);
	};
	return ((...a) => (t += 1, r || (r = we(!0), n = r.run(() => e(...a))), fs(i), n));
}
function Cs(e) {
	return /* @__PURE__ */ Rt(/* @__PURE__ */ F(e) ? new Proxy({}, {
		get(t, n, r) {
			return L(Reflect.get(e.value, n, r));
		},
		set(t, n, r) {
			return /* @__PURE__ */ F(e.value[n]) && !/* @__PURE__ */ F(r) ? e.value[n].value = r : e.value[n] = r, !0;
		},
		deleteProperty(t, n) {
			return Reflect.deleteProperty(e.value, n);
		},
		has(t, n) {
			return Reflect.has(e.value, n);
		},
		ownKeys() {
			return Object.keys(e.value);
		},
		getOwnPropertyDescriptor() {
			return {
				enumerable: !0,
				configurable: !0
			};
		}
	}) : e);
}
function ws(e) {
	return Cs(X(e));
}
function Ts(e, ...t) {
	let n = t.flat(), r = n[0];
	return ws(() => Object.fromEntries(typeof r == "function" ? Object.entries(/* @__PURE__ */ on(e)).filter(([e, t]) => r(en(t), e)) : n.map((t) => [t, vs(e, t)])));
}
function Es(e, t = 200, n = {}) {
	return ys(bs(t, n), e);
}
function Ds(e, t, n = {}) {
	let { immediate: r = !0, immediateCallback: i = !1 } = n, a = /* @__PURE__ */ Xt(!1), o;
	function s() {
		o &&= (clearTimeout(o), void 0);
	}
	function c() {
		a.value = !1, s();
	}
	function l(...n) {
		i && e(), s(), a.value = !0, o = setTimeout(() => {
			a.value = !1, o = void 0, e(...n);
		}, en(t));
	}
	return r && (a.value = !0, ps && l()), fs(c), {
		isPending: /* @__PURE__ */ Vt(a),
		start: l,
		stop: c
	};
}
function Os(e = 1e3, t = {}) {
	let { controls: n = !1, callback: r } = t, i = Ds(r ?? _s, e, t), a = X(() => !i.isPending.value);
	return n ? {
		ready: a,
		...i
	} : a;
}
function ks(e, t, n) {
	return Xn(e, t, {
		...n,
		immediate: !0
	});
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/@vueuse+core@14.3.0_vue@3.5.41_typescript@5.9.3_/node_modules/@vueuse/core/dist/index.js
var As = ps ? window : void 0;
ps && window.document, ps && window.navigator, ps && window.location;
function js(e) {
	let t = en(e);
	return t?.$el ?? t;
}
function Ms(...e) {
	let t = (e, t, n, r) => (e.addEventListener(t, n, r), () => e.removeEventListener(t, n, r)), n = X(() => {
		let t = xs(en(e[0])).filter((e) => e != null);
		return t.every((e) => typeof e != "string") ? t : void 0;
	});
	return ks(() => [
		n.value?.map((e) => js(e)) ?? [As].filter((e) => e != null),
		xs(en(n.value ? e[1] : e[0])),
		xs(L(n.value ? e[2] : e[1])),
		en(n.value ? e[3] : e[2])
	], ([e, n, r, i], a, o) => {
		if (!e?.length || !n?.length || !r?.length) return;
		let s = gs(i) ? { ...i } : i, c = e.flatMap((e) => n.flatMap((n) => r.map((r) => t(e, n, r, s))));
		o(() => {
			c.forEach((e) => e());
		});
	}, { flush: "post" });
}
function Ns() {
	let e = /* @__PURE__ */ Xt(!1), t = La();
	return t && Pr(() => {
		e.value = !0;
	}, t), e;
}
function Ps(e) {
	return typeof e == "function" ? e : typeof e == "string" ? (t) => t.key === e : Array.isArray(e) ? (t) => e.includes(t.key) : () => !0;
}
function Fs(...e) {
	let t, n, r = {};
	e.length === 3 ? (t = e[0], n = e[1], r = e[2]) : e.length === 2 ? typeof e[1] == "object" ? (t = !0, n = e[0], r = e[1]) : (t = e[0], n = e[1]) : (t = !0, n = e[0]);
	let { target: i = As, eventName: a = "keydown", passive: o = !1, dedupe: s = !1 } = r, c = Ps(t);
	return Ms(i, a, (e) => {
		e.repeat && en(s) || c(e) && n(e);
	}, o);
}
function Is(e, t = {}) {
	let { immediate: n = !0, fpsLimit: r = null, window: i = As, once: a = !1 } = t, o = /* @__PURE__ */ Xt(!1), s = X(() => {
		let e = en(r);
		return e ? 1e3 / e : null;
	}), c = 0, l = null;
	function u(t) {
		if (!o.value || !i) return;
		c ||= t;
		let n = t - c;
		if (s.value && n < s.value) {
			l = i.requestAnimationFrame(u);
			return;
		}
		if (c = t, e({
			delta: n,
			timestamp: t
		}), a) {
			o.value = !1, l = null;
			return;
		}
		l = i.requestAnimationFrame(u);
	}
	function d() {
		!o.value && i && (o.value = !0, c = 0, l = i.requestAnimationFrame(u));
	}
	function f() {
		o.value = !1, l != null && i && (i.cancelAnimationFrame(l), l = null);
	}
	return n && d(), fs(f), {
		isActive: /* @__PURE__ */ Vt(o),
		pause: f,
		resume: d
	};
}
function Ls(e) {
	return JSON.parse(JSON.stringify(e));
}
function Rs(e, t, n, r = {}) {
	var i, a;
	let { clone: o = !1, passive: s = !1, eventName: c, deep: l = !1, defaultValue: u, shouldEmit: d } = r, f = La(), p = n || f?.emit || (f == null || (i = f.$emit) == null ? void 0 : i.bind(f)) || (f == null || (a = f.proxy) == null || (a = a.$emit) == null ? void 0 : a.bind(f?.proxy)), m = c;
	t ||= "modelValue", m ||= `update:${t.toString()}`;
	let h = (e) => o ? typeof o == "function" ? o(e) : Ls(e) : e, g = () => ms(e[t]) ? h(e[t]) : u, _ = (e) => {
		d ? d(e) && p(m, e) : p(m, e);
	};
	if (s) {
		let n = /* @__PURE__ */ I(g()), r = !1;
		return Xn(() => e[t], (e) => {
			r || (r = !0, n.value = h(e), An(() => r = !1));
		}), Xn(n, (n) => {
			!r && (n !== e[t] || l) && _(n);
		}, { deep: l }), n;
	}
	return X({
		get() {
			return g();
		},
		set(e) {
			_(e);
		}
	});
}
//#endregion
//#region virtual:nuxt-ui-app-config
var zs = {
	ui: {
		colors: {
			primary: "cyan",
			secondary: "blue",
			success: "green",
			info: "blue",
			warning: "yellow",
			error: "red",
			neutral: "zinc"
		},
		icons: {
			arrowDown: "i-lucide-arrow-down",
			arrowLeft: "i-lucide-arrow-left",
			arrowRight: "i-lucide-arrow-right",
			arrowUp: "i-lucide-arrow-up",
			caution: "i-lucide-circle-alert",
			check: "i-lucide-check",
			chevronDoubleLeft: "i-lucide-chevrons-left",
			chevronDoubleRight: "i-lucide-chevrons-right",
			chevronDown: "i-lucide-chevron-down",
			chevronLeft: "i-lucide-chevron-left",
			chevronRight: "i-lucide-chevron-right",
			chevronUp: "i-lucide-chevron-up",
			close: "i-lucide-x",
			copy: "i-lucide-copy",
			copyCheck: "i-lucide-copy-check",
			dark: "i-lucide-moon",
			drag: "i-lucide-grip-vertical",
			ellipsis: "i-lucide-ellipsis",
			error: "i-lucide-circle-x",
			external: "i-lucide-arrow-up-right",
			eye: "i-lucide-eye",
			eyeOff: "i-lucide-eye-off",
			file: "i-lucide-file",
			folder: "i-lucide-folder",
			folderOpen: "i-lucide-folder-open",
			hash: "i-lucide-hash",
			info: "i-lucide-info",
			light: "i-lucide-sun",
			loading: "i-lucide-loader-circle",
			menu: "i-lucide-menu",
			minus: "i-lucide-minus",
			panelClose: "i-lucide-panel-left-close",
			panelOpen: "i-lucide-panel-left-open",
			plus: "i-lucide-plus",
			reload: "i-lucide-rotate-ccw",
			search: "i-lucide-search",
			stop: "i-lucide-square",
			success: "i-lucide-circle-check",
			system: "i-lucide-monitor",
			tip: "i-lucide-lightbulb",
			upload: "i-lucide-upload",
			warning: "i-lucide-triangle-alert"
		},
		tv: { twMergeConfig: {} }
	},
	colorMode: !1
}, Bs = /* @__PURE__ */ new Set([
	"link",
	"style",
	"script",
	"noscript"
]), Vs = /* @__PURE__ */ new Set([
	"title",
	"titleTemplate",
	"script",
	"style",
	"noscript"
]), Hs = /* @__PURE__ */ new Set([
	"base",
	"meta",
	"link",
	"style",
	"script",
	"noscript"
]), Us = /* @__PURE__ */ new Set([
	"title",
	"base",
	"htmlAttrs",
	"bodyAttrs",
	"meta",
	"link",
	"style",
	"script",
	"noscript"
]), Ws = /* @__PURE__ */ new Set([
	"base",
	"title",
	"titleTemplate",
	"bodyAttrs",
	"htmlAttrs",
	"templateParams"
]), Gs = /* @__PURE__ */ new Set([
	"key",
	"tagPosition",
	"tagPriority",
	"tagDuplicateStrategy",
	"innerHTML",
	"textContent",
	"processTemplateParams"
]), Ks = /* @__PURE__ */ new Set([
	"templateParams",
	"htmlAttrs",
	"bodyAttrs"
]), qs = /* @__PURE__ */ new Set([
	"theme-color",
	"google-site-verification",
	"og",
	"article",
	"book",
	"profile",
	"twitter",
	"author"
]), Js = [
	"name",
	"property",
	"http-equiv"
], Ys = /* @__PURE__ */ new Set([
	"viewport",
	"description",
	"keywords",
	"robots"
]);
function Xs(e) {
	let t = e.split(":");
	return t.length ? qs.has(t[1]) : !1;
}
function Zs(e) {
	let { props: t, tag: n } = e;
	if (Ws.has(n)) return n;
	if (n === "link" && t.rel === "canonical") return "canonical";
	if (n === "link" && t.rel === "alternate") {
		if (t.hreflang) return `alternate:${t.hreflang}`;
		if (t.type) return `alternate:${t.type}:${t.href || ""}`;
	}
	if (t.charset) return "charset";
	if (e.tag === "meta") {
		for (let r of Js) if (t[r] !== void 0) {
			let i = t[r], a = i && typeof i == "string" && i.includes(":"), o = i && Ys.has(i);
			return `${n}:${i}${!(a || o) && e.key ? `:key:${e.key}` : ""}`;
		}
	}
	if (e.key) return `${n}:key:${e.key}`;
	if (t.id) return `${n}:id:${t.id}`;
	if (n === "link" && t.rel === "alternate") return `alternate:${t.href || ""}`;
	if (Vs.has(n)) {
		let t = e.textContent || e.innerHTML;
		if (t) return `${n}:content:${t}`;
	}
}
function Qs(e) {
	return e._h || e._d || e.textContent || e.innerHTML || `${e.tag}:${Object.entries(e.props).map(([e, t]) => `${e}:${String(t)}`).join(",")}`;
}
function $s(e, t, n) {
	typeof e == "function" && (!n || n !== "titleTemplate" && (n[0] !== "o" || n[1] !== "n")) && (e = e());
	let r = t ? t(n, e) : e;
	if (Array.isArray(r)) return r.map((e) => $s(e, t));
	if (r?.constructor === Object) {
		let e = {};
		for (let n of Object.keys(r)) e[n] = $s(r[n], t, n);
		return e;
	}
	return r;
}
function ec(e, t) {
	let n = e === "style" ? /* @__PURE__ */ new Map() : /* @__PURE__ */ new Set();
	function r(t) {
		if (t == null || t === void 0) return;
		let r = String(t).trim();
		if (r) {
			if (e === "style") {
				let [e, ...t] = r.split(":").map((e) => e ? e.trim() : "");
				e && t.length && n.set(e, t.join(":"));
			} else r.split(" ").filter(Boolean).forEach((e) => n.add(e));
		}
	}
	return typeof t == "string" ? e === "style" ? t.split(";").forEach(r) : r(t) : Array.isArray(t) ? t.forEach((e) => r(e)) : t && typeof t == "object" && Object.entries(t).forEach(([t, i]) => {
		i && i !== "false" && (e === "style" ? n.set(String(t).trim(), String(i)) : r(t));
	}), n;
}
function tc(e, t) {
	if (e.props = e.props || {}, !t) return e;
	if (e.tag === "templateParams") return e.props = t, e;
	let n = Hs.has(e.tag) || e.tag === "htmlAttrs" || e.tag === "bodyAttrs";
	return Object.entries(t).forEach(([r, i]) => {
		if (r === "__proto__" || r === "constructor" || r === "prototype") return;
		if (i === null) {
			e.props[r] = null;
			return;
		}
		if (r === "class" || r === "style") {
			e.props[r] = ec(r, i);
			return;
		}
		if (Gs.has(r)) {
			if ((r === "textContent" || r === "innerHTML") && typeof i == "object") {
				let n = t.type;
				if (t.type || (n = "application/json"), !n?.endsWith("json") && n !== "speculationrules") return;
				t.type = n, e.props.type = n, e[r] = JSON.stringify(i);
			} else e[r] = i;
			return;
		}
		let a = r.startsWith("data-"), o = n && !a ? r.toLowerCase() : r, s = String(i), c = e.tag === "meta" && o === "content";
		s === "true" || s === "" ? e.props[o] = a || c ? s : !0 : !i && a && s === "false" ? e.props[o] = "false" : i !== void 0 && (e.props[o] = i);
	}), e;
}
function nc(e, t) {
	let n = tc({
		tag: e,
		props: {}
	}, typeof t == "object" && typeof t != "function" ? t : { [e === "script" || e === "noscript" || e === "style" ? "innerHTML" : "textContent"]: t });
	return n.key && Bs.has(n.tag) && (n.props["data-hid"] = n._h = n.key), n.tag === "script" && typeof n.innerHTML == "object" && (n.innerHTML = JSON.stringify(n.innerHTML), n.props.type = n.props.type || "application/json"), Array.isArray(n.props.content) ? n.props.content.map((e) => ({
		...n,
		props: {
			...n.props,
			content: e
		}
	})) : n;
}
function rc(e, t) {
	if (!e) return [];
	typeof e == "function" && (e = e());
	let n = (e, n) => {
		for (let r = 0; r < t.length; r++) n = t[r](e, n);
		return n;
	};
	e = n(void 0, e);
	let r = [];
	return e = $s(e, n), Object.entries(e || {}).forEach(([e, t]) => {
		if (t !== void 0) for (let n of Array.isArray(t) ? t : [t]) r.push(nc(e, n));
	}), r.flat();
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/unhead@2.1.15/node_modules/unhead/dist/shared/unhead.CbpEuj3y.mjs
var ic = (e, t) => e._w === t._w ? e._p - t._p : e._w - t._w, ac = {
	base: -10,
	title: 10
}, oc = {
	critical: -8,
	high: -1,
	low: 2
}, sc = {
	meta: {
		"content-security-policy": -30,
		charset: -20,
		viewport: -15
	},
	link: {
		preconnect: 20,
		stylesheet: 60,
		preload: 70,
		modulepreload: 70,
		prefetch: 90,
		"dns-prefetch": 90,
		prerender: 90
	},
	script: {
		async: 30,
		defer: 80,
		sync: 50
	},
	style: {
		imported: 40,
		sync: 60
	}
}, cc = /@import/, lc = (e) => e === "" || e === !0;
function uc(e, t) {
	if (typeof t.tagPriority == "number") return t.tagPriority;
	let n = 100, r = oc[t.tagPriority] || 0, i = e.resolvedOptions.disableCapoSorting ? {
		link: {},
		script: {},
		style: {}
	} : sc;
	if (t.tag in ac) n = ac[t.tag];
	else if (t.tag === "meta") {
		let e = t.props["http-equiv"] === "content-security-policy" ? "content-security-policy" : t.props.charset ? "charset" : t.props.name === "viewport" ? "viewport" : null;
		e && (n = sc.meta[e]);
	} else if (t.tag === "link" && t.props.rel) n = i.link[t.props.rel];
	else if (t.tag === "script") {
		let e = String(t.props.type);
		lc(t.props.async) ? n = i.script.async : t.props.src && !lc(t.props.defer) && !lc(t.props.async) && e !== "module" && !e.endsWith("json") || t.innerHTML && !e.endsWith("json") ? n = i.script.sync : (lc(t.props.defer) && t.props.src && !lc(t.props.async) || e === "module") && (n = i.script.defer);
	} else t.tag === "style" && (n = t.innerHTML && cc.test(t.innerHTML) ? i.style.imported : i.style.sync);
	return (n || 100) + r;
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/unhead@2.1.15/node_modules/unhead/dist/shared/unhead.CaI5ZD4O.mjs
function dc(e, t) {
	let n = typeof t == "function" ? t(e) : t, r = n.key || String(e.plugins.size + 1);
	e.plugins.get(r) || (e.plugins.set(r, n), e.hooks.addHooks(n.hooks || {}));
}
// @__NO_SIDE_EFFECTS__
function fc(e = {}) {
	let t = ds();
	t.addHooks(e.hooks || {});
	let n = !e.document, r = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Set(), o = {
		_entryCount: 1,
		plugins: i,
		dirty: !1,
		resolvedOptions: e,
		hooks: t,
		ssr: n,
		entries: r,
		headEntries() {
			return [...r.values()];
		},
		use: (e) => dc(o, e),
		push(e, i) {
			let s = { ...i || {} };
			delete s.head;
			let c = s._index ?? o._entryCount++, l = {
				_i: c,
				input: e,
				options: s
			}, u = {
				_poll(e = !1) {
					o.dirty = !0, !e && a.add(c), t.callHook("entries:updated", o);
				},
				dispose() {
					r.delete(c) && o.invalidate();
				},
				patch(e) {
					(!s.mode || s.mode === "server" && n || s.mode === "client" && !n) && (l.input = e, r.set(c, l), u._poll());
				}
			};
			return u.patch(e), u;
		},
		async resolveTags() {
			let n = {
				tagMap: /* @__PURE__ */ new Map(),
				tags: [],
				entries: [...o.entries.values()]
			};
			for (await t.callHook("entries:resolve", n); a.size;) {
				let n = a.values().next().value;
				a.delete(n);
				let i = r.get(n);
				if (i) {
					let n = {
						tags: rc(i.input, e.propResolvers || []).map((e) => Object.assign(e, i.options)),
						entry: i
					};
					await t.callHook("entries:normalize", n), i._tags = n.tags.map((e, t) => (e._w = uc(o, e), e._p = (i._i << 10) + t, e._d = Zs(e), e._d || (e._h = Qs(e)), e));
				}
			}
			let i = !1;
			n.entries.flatMap((e) => (e._tags || []).map((e) => ({
				...e,
				props: { ...e.props }
			}))).sort(ic).reduce((e, t) => {
				let n = t._d || t._h;
				if (!e.has(n)) return e.set(n, t);
				let r = e.get(n);
				if ((t?.tagDuplicateStrategy || (Ks.has(t.tag) ? "merge" : null) || (t.key && t.key === r.key ? "merge" : null)) === "merge") {
					let i = { ...r.props };
					Object.entries(t.props).forEach(([e, t]) => i[e] = e === "style" ? new Map([...r.props.style || /* @__PURE__ */ new Map(), ...t]) : e === "class" ? /* @__PURE__ */ new Set([...r.props.class || /* @__PURE__ */ new Set(), ...t]) : t), e.set(n, {
						...t,
						props: i
					});
				} else t._p >> 10 == r._p >> 10 && t.tag === "meta" && Xs(n) ? (e.set(n, Object.assign([...Array.isArray(r) ? r : [r], t], t)), i = !0) : (t._w === r._w ? t._p > r._p : t?._w < r?._w) && e.set(n, t);
				return e;
			}, n.tagMap);
			let s = n.tagMap.get("title"), c = n.tagMap.get("titleTemplate");
			if (o._title = s?.textContent, c) {
				let e = c?.textContent;
				if (o._titleTemplate = e, e) {
					let t = typeof e == "function" ? e(s?.textContent) : e;
					typeof t == "string" && !o.plugins.has("template-params") && (t = t.replace("%s", s?.textContent || "")), s ? t === null ? n.tagMap.delete("title") : n.tagMap.set("title", {
						...s,
						textContent: t
					}) : (c.tag = "title", c.textContent = t);
				}
			}
			n.tags = Array.from(n.tagMap.values()), i && (n.tags = n.tags.flat().sort(ic)), await t.callHook("tags:beforeResolve", n), await t.callHook("tags:resolve", n), await t.callHook("tags:afterResolve", n);
			let l = [];
			for (let e of n.tags) {
				let { innerHTML: t, tag: n, props: r } = e;
				Us.has(n) && (Object.keys(r).length === 0 && !e.innerHTML && !e.textContent || n === "meta" && !r.content && !r["http-equiv"] && !r.charset || (n === "script" && t && (String(r.type).endsWith("json") ? e.innerHTML = (typeof t == "string" ? t : JSON.stringify(t)).replace(/</g, "\\u003C") : typeof t == "string" && (e.innerHTML = t.replace(RegExp(`</${n}`, "g"), `<\\/${n}`)), e._d = Zs(e)), l.push(e)));
			}
			return l;
		},
		invalidate() {
			for (let e of r.values()) a.add(e._i);
			o.dirty = !0, t.callHook("entries:updated", o);
		}
	};
	return (e?.plugins || []).forEach((e) => dc(o, e)), o.hooks.callHook("init", o), e.init?.forEach((e) => e && o.push(e)), o;
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/@unhead+vue@2.1.15_vue@3.5.41_typescript@5.9.3_/node_modules/@unhead/vue/dist/shared/vue.N9zWjxoK.mjs
var pc = (e, t) => /* @__PURE__ */ F(t) ? en(t) : t, mc = "usehead";
// @__NO_SIDE_EFFECTS__
function hc(e) {
	return { install(t) {
		t.config.globalProperties.$unhead = e, t.config.globalProperties.$head = e, t.provide(mc, e);
	} }.install;
}
// @__NO_SIDE_EFFECTS__
function gc() {
	if (Gn()) {
		let e = Wn(mc);
		if (e) return e;
	}
	throw Error("useHead() was called without provide context, ensure you call it through the setup() function.");
}
function _c(e, t = {}) {
	let n = t.head || /* @__PURE__ */ gc();
	return n.ssr ? n.push(e || {}, t) : vc(n, e, t);
}
function vc(e, t, n = {}) {
	let r = /* @__PURE__ */ I(!1), i;
	return Jn(() => {
		let a = r.value ? {} : $s(t, pc);
		i ? i.patch(a) : i = e.push(a, n);
	}), La() && (Lr(() => {
		i.dispose();
	}), Or(() => {
		r.value = !0;
	}), Dr(() => {
		r.value = !1;
	})), i;
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/@nuxt+ui@4.9.0_patch_hash=4ccf9386c7cac79ac933037f07f03c58e3649f1cf82050f5b2514226e1e46_6210cc9a3324cad860a299c7c3e3caac/node_modules/@nuxt/ui/dist/runtime/vue/composables/useAppConfig.js
var yc = /* @__PURE__ */ Rt(zs), bc = () => yc;
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/@nuxt+ui@4.9.0_patch_hash=4ccf9386c7cac79ac933037f07f03c58e3649f1cf82050f5b2514226e1e46_6210cc9a3324cad860a299c7c3e3caac/node_modules/@nuxt/ui/dist/runtime/composables/defineLocale.js
// @__NO_SIDE_EFFECTS__
function xc(e) {
	return rs(e, { dir: "ltr" });
}
String.fromCharCode;
var Sc = /^[\s\w\0+.-]{2,}:([/\\]{1,2})/, Cc = /^[\s\w\0+.-]{2,}:([/\\]{2})?/, wc = /^([/\\]\s*){2,}[^/\\]/;
function Tc(e, t = {}) {
	return typeof t == "boolean" && (t = { acceptRelative: t }), t.strict ? Sc.test(e) : Cc.test(e) || (t.acceptRelative ? wc.test(e) : !1);
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/@nuxt+ui@4.9.0_patch_hash=4ccf9386c7cac79ac933037f07f03c58e3649f1cf82050f5b2514226e1e46_6210cc9a3324cad860a299c7c3e3caac/node_modules/@nuxt/ui/dist/runtime/utils/index.js
function Ec(e, t) {
	let n = { ...e };
	for (let e of t) delete n[e];
	return n;
}
function Dc(e, t, n) {
	typeof t == "string" && (t = t.split(".").map((e) => {
		let t = Number(e);
		return Number.isNaN(t) ? e : t;
	}));
	let r = e;
	for (let e of t) {
		if (r == null) return n;
		r = r[e];
	}
	return r === void 0 ? n : r;
}
function Oc(e) {
	let t = Number.parseFloat(e);
	return Number.isNaN(t) ? e : t;
}
function kc(e, t) {
	return !e && !t ? "" : [...Array.isArray(e) ? e : [e], t].filter(Boolean);
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/@nuxt+ui@4.9.0_patch_hash=4ccf9386c7cac79ac933037f07f03c58e3649f1cf82050f5b2514226e1e46_6210cc9a3324cad860a299c7c3e3caac/node_modules/@nuxt/ui/dist/runtime/utils/locale.js
function Ac(e) {
	return (t, n) => jc(t, n, L(e));
}
function jc(e, t, n) {
	return Dc(n, `messages.${e}`, e).replace(/\{(\w+)\}/g, (e, n) => `${t?.[n] ?? `{${n}}`}`);
}
function Mc(e) {
	return {
		lang: X(() => L(e).name),
		code: X(() => L(e).code),
		dir: X(() => L(e).dir),
		locale: /* @__PURE__ */ F(e) ? e : /* @__PURE__ */ I(e),
		t: Ac(e)
	};
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/@nuxt+ui@4.9.0_patch_hash=4ccf9386c7cac79ac933037f07f03c58e3649f1cf82050f5b2514226e1e46_6210cc9a3324cad860a299c7c3e3caac/node_modules/@nuxt/ui/dist/runtime/locale/en.js
var Nc = /* @__PURE__ */ xc({
	name: "English",
	code: "en",
	messages: {
		alert: { close: "Close" },
		authForm: {
			hidePassword: "Hide password",
			showPassword: "Show password",
			submit: "Continue"
		},
		banner: { close: "Close" },
		calendar: {
			nextMonth: "Next month",
			nextYear: "Next year",
			prevMonth: "Previous month",
			prevYear: "Previous year"
		},
		carousel: {
			dots: "Choose slide to display",
			goto: "Go to slide {slide}",
			next: "Next",
			prev: "Prev"
		},
		chatPrompt: { placeholder: "Type your message here…" },
		chatPromptSubmit: { label: "Send prompt" },
		colorMode: {
			dark: "Dark",
			light: "Light",
			switchToDark: "Switch to dark mode",
			switchToLight: "Switch to light mode",
			system: "System"
		},
		commandPalette: {
			back: "Back",
			close: "Close",
			noData: "No data",
			noMatch: "No matching data",
			placeholder: "Type a command or search…"
		},
		contentSearch: {
			links: "Links",
			search: "Results",
			theme: "Theme"
		},
		contentSearchButton: { label: "Search…" },
		contentToc: { title: "On this page" },
		dropdownMenu: {
			noMatch: "No matching data",
			search: "Search…"
		},
		dashboardSearch: { theme: "Theme" },
		dashboardSearchButton: { label: "Search…" },
		dashboardSidebarCollapse: {
			collapse: "Collapse sidebar",
			expand: "Expand sidebar"
		},
		dashboardSidebarToggle: {
			close: "Close sidebar",
			open: "Open sidebar"
		},
		error: { clear: "Back to home" },
		fileUpload: { removeFile: "Remove {filename}" },
		header: {
			close: "Close menu",
			open: "Open menu"
		},
		inputMenu: {
			create: "Create \"{label}\"",
			noData: "No data",
			noMatch: "No matching data"
		},
		inputNumber: {
			decrement: "Decrement",
			increment: "Increment"
		},
		listbox: {
			noData: "No data",
			noMatch: "No matching data",
			search: "Search…"
		},
		modal: { close: "Close" },
		pricingTable: { caption: "Pricing plan comparison" },
		prose: {
			codeCollapse: {
				closeText: "Collapse",
				name: "code",
				openText: "Expand"
			},
			collapsible: {
				closeText: "Hide",
				name: "properties",
				openText: "Show"
			},
			pre: { copy: "Copy code to clipboard" },
			prompt: {
				copy: "Copy prompt",
				openIn: "Open in {name}"
			}
		},
		chatReasoning: {
			thinking: "Thinking…",
			thought: "Thought",
			thoughtFor: "Thought for {duration}"
		},
		sidebar: {
			close: "Close",
			toggle: "Toggle"
		},
		selectMenu: {
			create: "Create \"{label}\"",
			noData: "No data",
			noMatch: "No matching data",
			search: "Search…"
		},
		slideover: { close: "Close" },
		table: { noData: "No data" },
		toast: { close: "Close" }
	}
}), Pc = Symbol.for("nuxt-ui.locale-context"), Fc = Ss((e) => {
	let t = e || /* @__PURE__ */ ln(Wn(Pc, Nc));
	return Mc(X(() => t.value || Nc));
}), Ic = {}, Lc = (e, t) => {
	if (Ic[e]) return Ic[e];
	let n = /* @__PURE__ */ I(t());
	return Ic[e] = n, n;
}, Rc = ds();
function zc() {
	return {
		isHydrating: !0,
		payload: { serverRendered: !1 },
		hooks: Rc,
		hook: Rc.hook
	};
}
function Bc(e) {
	return { install(t) {
		t.runWithContext(() => e({ vueApp: t }));
	} };
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/reka-ui@2.9.10_vue@3.5.41_typescript@5.9.3_/node_modules/reka-ui/dist/shared/createContext.js
function Vc(e, t) {
	let n = typeof e == "string" && !t ? `${e}Context` : t, r = Symbol(n);
	return [(t) => {
		let n = Wn(r, t);
		if (n || n === null) return n;
		throw Error(`Injection \`${r.toString()}\` not found. Component must be used within ${Array.isArray(e) ? `one of the following components: ${e.join(", ")}` : `\`${e}\``}`);
	}, (e) => (Un(r, e), e)];
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/reka-ui@2.9.10_vue@3.5.41_typescript@5.9.3_/node_modules/reka-ui/dist/shared/getActiveElement.js
function Hc() {
	let e = document.activeElement;
	if (e == null) return null;
	for (; e != null && e.shadowRoot != null && e.shadowRoot.activeElement != null;) e = e.shadowRoot.activeElement;
	return e;
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/reka-ui@2.9.10_vue@3.5.41_typescript@5.9.3_/node_modules/reka-ui/dist/shared/nullish.js
function Uc(e) {
	return e == null;
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/reka-ui@2.9.10_vue@3.5.41_typescript@5.9.3_/node_modules/reka-ui/dist/shared/renderSlotFragments.js
function Wc(e) {
	return e ? e.flatMap((e) => e.type === V ? Wc(e.children) : [e]) : [];
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/reka-ui@2.9.10_vue@3.5.41_typescript@5.9.3_/node_modules/reka-ui/dist/ConfigProvider/ConfigProvider.js
var [Gc, Kc] = /*#__PURE__*/ Vc("ConfigProvider"), qc = /* @__PURE__ */ z({
	inheritAttrs: !1,
	__name: "ConfigProvider",
	props: {
		dir: {
			type: String,
			required: !1,
			default: "ltr"
		},
		locale: {
			type: String,
			required: !1,
			default: "en"
		},
		scrollBody: {
			type: [Boolean, Object],
			required: !1,
			default: !0
		},
		nonce: {
			type: String,
			required: !1,
			default: void 0
		},
		useId: {
			type: Function,
			required: !1,
			default: void 0
		}
	},
	setup(e) {
		let t = e, { dir: n, locale: r, scrollBody: i, nonce: a } = /* @__PURE__ */ on(t);
		return Kc({
			dir: n,
			locale: r,
			scrollBody: i,
			nonce: a,
			useId: t.useId
		}), (e, t) => B(e.$slots, "default");
	}
});
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/reka-ui@2.9.10_vue@3.5.41_typescript@5.9.3_/node_modules/reka-ui/dist/shared/useEmitAsProps.js
function Jc(e) {
	let t = La(), n = t?.type.emits, r = {};
	return n?.length || console.warn(`No emitted event found. Please check component: ${t?.type.__name}`), n?.forEach((t) => {
		r[ie(D(t))] = (...n) => e(t, ...n);
	}), r;
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/reka-ui@2.9.10_vue@3.5.41_typescript@5.9.3_/node_modules/reka-ui/dist/shared/useForwardExpose.js
function Yc() {
	let e = La(), t = /* @__PURE__ */ I(), n = X(() => r());
	Ir(() => {
		n.value !== r() && $t(t);
	});
	function r() {
		return t.value && "$el" in t.value && ["#text", "#comment"].includes(t.value.$el.nodeName) ? t.value.$el.nextElementSibling : js(t);
	}
	let i = Object.assign({}, e.exposed), a = {};
	for (let t in e.props) Object.defineProperty(a, t, {
		enumerable: !0,
		configurable: !0,
		get: () => e.props[t]
	});
	if (Object.keys(i).length > 0) for (let e in i) Object.defineProperty(a, e, {
		enumerable: !0,
		configurable: !0,
		get: () => i[e]
	});
	Object.defineProperty(a, "$el", {
		enumerable: !0,
		configurable: !0,
		get: () => e.vnode.el
	}), e.exposed = a;
	function o(n) {
		if (t.value = n, n && (Object.defineProperty(a, "$el", {
			enumerable: !0,
			configurable: !0,
			get: () => n instanceof Element ? n : n.$el
		}), !(n instanceof Element) && !Object.hasOwn(n, "$el"))) {
			let t = n.$.exposed, r = Object.assign({}, a);
			for (let e in t) Object.defineProperty(r, e, {
				enumerable: !0,
				configurable: !0,
				get: () => t[e]
			});
			e.exposed = r;
		}
	}
	return {
		forwardRef: o,
		currentRef: t,
		currentElement: n
	};
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/reka-ui@2.9.10_vue@3.5.41_typescript@5.9.3_/node_modules/reka-ui/dist/shared/useForwardProps.js
function Xc(e) {
	let t = La(), n = Object.keys(t?.type.props ?? {}).reduce((e, n) => {
		let r = (t?.type.props[n]).default;
		return r !== void 0 && (e[n] = r), e;
	}, {}), r = /* @__PURE__ */ ln(e);
	return X(() => {
		let e = {}, i = t?.vnode.props ?? {};
		return Object.keys(i).forEach((t) => {
			e[D(t)] = i[t];
		}), Object.keys({
			...n,
			...e
		}).reduce((e, t) => (r.value[t] !== void 0 && (e[t] = r.value[t]), e), {});
	});
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/reka-ui@2.9.10_vue@3.5.41_typescript@5.9.3_/node_modules/reka-ui/dist/shared/useStateMachine.js
function Zc(e, t) {
	let n = /* @__PURE__ */ I(e);
	function r(e) {
		return t[n.value][e] ?? n.value;
	}
	return {
		state: n,
		dispatch: (e) => {
			n.value = r(e);
		}
	};
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/reka-ui@2.9.10_vue@3.5.41_typescript@5.9.3_/node_modules/reka-ui/dist/Presence/usePresence.js
function Qc(e, t) {
	let n = /* @__PURE__ */ I({}), r = /* @__PURE__ */ I("none"), i = /* @__PURE__ */ I(e), a = e.value ? "mounted" : "unmounted", o, s = t.value?.ownerDocument.defaultView ?? As, { state: c, dispatch: l } = Zc(a, {
		mounted: {
			UNMOUNT: "unmounted",
			ANIMATION_OUT: "unmountSuspended"
		},
		unmountSuspended: {
			MOUNT: "mounted",
			ANIMATION_END: "unmounted"
		},
		unmounted: { MOUNT: "mounted" }
	}), u = (e) => {
		if (ps) {
			let n = new CustomEvent(e, {
				bubbles: !1,
				cancelable: !1
			});
			t.value?.dispatchEvent(n);
		}
	};
	Xn(e, async (e, i) => {
		let a = i !== e;
		if (await An(), a) {
			let a = r.value, o = $c(t.value);
			e ? (l("MOUNT"), u("enter"), o === "none" && u("after-enter")) : o === "none" || o === "undefined" || n.value?.display === "none" ? (l("UNMOUNT"), u("leave"), u("after-leave")) : i && a !== o ? (l("ANIMATION_OUT"), u("leave")) : (l("UNMOUNT"), u("after-leave"));
		}
	}, { immediate: !0 });
	let d = (e) => {
		let n = $c(t.value), r = n.includes(CSS.escape(e.animationName)), a = c.value === "mounted" ? "enter" : "leave";
		if (e.target === t.value && r && (u(`after-${a}`), l("ANIMATION_END"), !i.value)) {
			let e = t.value.style.animationFillMode;
			t.value.style.animationFillMode = "forwards", o = s?.setTimeout(() => {
				t.value?.style.animationFillMode === "forwards" && (t.value.style.animationFillMode = e);
			});
		}
		e.target === t.value && n === "none" && l("ANIMATION_END");
	}, f = (e) => {
		e.target === t.value && (r.value = $c(t.value));
	}, p = Xn(t, (e, t) => {
		e ? (n.value = getComputedStyle(e), e.addEventListener("animationstart", f), e.addEventListener("animationcancel", d), e.addEventListener("animationend", d)) : (l("ANIMATION_END"), o !== void 0 && s?.clearTimeout(o), t?.removeEventListener("animationstart", f), t?.removeEventListener("animationcancel", d), t?.removeEventListener("animationend", d));
	}, { immediate: !0 }), m = Xn(c, () => {
		let e = $c(t.value);
		r.value = c.value === "mounted" ? e : "none";
	});
	return Rr(() => {
		p(), m();
	}), { isPresent: X(() => ["mounted", "unmountSuspended"].includes(c.value)) };
}
function $c(e) {
	return e && getComputedStyle(e).animationName || "none";
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/reka-ui@2.9.10_vue@3.5.41_typescript@5.9.3_/node_modules/reka-ui/dist/Presence/Presence.js
var el = /*#__PURE__*/ z({
	name: "Presence",
	props: {
		present: {
			type: Boolean,
			required: !0
		},
		forceMount: { type: Boolean }
	},
	slots: {},
	setup(e, { slots: t, expose: n }) {
		let { present: r, forceMount: i } = /* @__PURE__ */ on(e), a = /* @__PURE__ */ I(), { isPresent: o } = Qc(r, a);
		n({ present: o });
		let s = t.default({ present: o.value });
		s = Wc(s || []);
		let c = La();
		if (s && s?.length > 1) {
			let e = c?.parent?.type.name ? `<${c.parent.type.name} />` : "component";
			throw Error([
				`Detected an invalid children for \`${e}\` for  \`Presence\` component.`,
				"",
				"Note: Presence works similarly to `v-if` directly, but it waits for animation/transition to finished before unmounting. So it expect only one direct child of valid VNode type.",
				"You can apply a few solutions:",
				["Provide a single child element so that `presence` directive attach correctly.", "Ensure the first child is an actual element instead of a raw text node or comment node."].map((e) => `  - ${e}`).join("\n")
			].join("\n"));
		}
		return () => i.value || r.value || o.value ? to(t.default({ present: o.value })[0], { ref: (e) => {
			let t = js(e);
			return t?.hasAttribute === void 0 || (t?.hasAttribute("data-reka-popper-content-wrapper") ? a.value = t.firstElementChild : a.value = t), t;
		} }) : null;
	}
}), tl = /*#__PURE__*/ z({
	name: "PrimitiveSlot",
	inheritAttrs: !1,
	setup(e, { attrs: t, slots: n }) {
		return () => {
			if (!n.default) return null;
			let e = Wc(n.default()), r = e.findIndex((e) => e.type !== ma);
			if (r === -1) return e;
			let i = e[r];
			delete i.props?.ref;
			let a = i.props ? Y(t, i.props) : t, o = Oa({
				...i,
				props: {}
			}, a);
			return e.length === 1 ? o : (e[r] = o, e);
		};
	}
}), nl = [
	"area",
	"img",
	"input"
], rl = /*#__PURE__*/ z({
	name: "Primitive",
	inheritAttrs: !1,
	props: {
		asChild: {
			type: Boolean,
			default: !1
		},
		as: {
			type: [String, Object],
			default: "div"
		}
	},
	setup(e, { attrs: t, slots: n }) {
		let r = e.asChild ? "template" : e.as;
		return typeof r == "string" && nl.includes(r) ? () => to(r, t) : r === "template" ? () => to(tl, t, { default: n.default }) : () => to(e.as, t, { default: n.default });
	}
});
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/reka-ui@2.9.10_vue@3.5.41_typescript@5.9.3_/node_modules/reka-ui/dist/Primitive/usePrimitiveElement.js
function il() {
	let e = /* @__PURE__ */ I();
	return {
		primitiveElement: e,
		currentElement: X(() => ["#text", "#comment"].includes(e.value?.$el.nodeName) ? e.value?.$el.nextElementSibling : js(e))
	};
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/reka-ui@2.9.10_vue@3.5.41_typescript@5.9.3_/node_modules/reka-ui/dist/DismissableLayer/DismissableLayer.js
var al = /*#__PURE__*/ Rt({
	layersRoot: /* @__PURE__ */ new Set(),
	layersWithOutsidePointerEventsDisabled: /* @__PURE__ */ new Set(),
	originalBodyPointerEvents: void 0,
	branches: /* @__PURE__ */ new Set()
}), ol = /* @__PURE__ */ z({
	__name: "DismissableLayerBranch",
	props: {
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1
		}
	},
	setup(e) {
		let t = e, { forwardRef: n, currentElement: r } = Yc();
		return Pr(() => {
			al.branches.add(r.value);
		}), Rr(() => {
			al.branches.delete(r.value);
		}), (e, r) => (H(), W(L(rl), Y({ ref: L(n) }, t), {
			default: R(() => [B(e.$slots, "default")]),
			_: 3
		}, 16));
	}
});
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/reka-ui@2.9.10_vue@3.5.41_typescript@5.9.3_/node_modules/reka-ui/dist/FocusScope/utils.js
function sl(e, { select: t = !1 } = {}) {
	let n = Hc();
	for (let r of e) if (ul(r, { select: t }), Hc() !== n) return !0;
}
function cl(e) {
	let t = [], n = document.createTreeWalker(e, NodeFilter.SHOW_ELEMENT, { acceptNode: (e) => {
		let t = e.tagName === "INPUT" && e.type === "hidden";
		return e.disabled || e.hidden || t ? NodeFilter.FILTER_SKIP : e.tabIndex >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
	} });
	for (; n.nextNode();) t.push(n.currentNode);
	return t;
}
function ll(e) {
	return e instanceof HTMLInputElement && "select" in e;
}
function ul(e, { select: t = !1 } = {}) {
	if (e && e.focus) {
		let n = Hc();
		e.focus({ preventScroll: !0 }), e !== n && ll(e) && t && e.select();
	}
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/reka-ui@2.9.10_vue@3.5.41_typescript@5.9.3_/node_modules/reka-ui/dist/Teleport/Teleport.js
var dl = /* @__PURE__ */ z({
	__name: "Teleport",
	props: {
		to: {
			type: null,
			required: !1,
			default: "body"
		},
		disabled: {
			type: Boolean,
			required: !1
		},
		defer: {
			type: Boolean,
			required: !1
		},
		forceMount: {
			type: Boolean,
			required: !1
		}
	},
	setup(e) {
		let t = Ns();
		return (e, n) => L(t) || e.forceMount ? (H(), W(dr, {
			key: 0,
			to: e.to,
			disabled: e.disabled,
			defer: e.defer
		}, [B(e.$slots, "default")], 8, [
			"to",
			"disabled",
			"defer"
		])) : J("v-if", !0);
	}
}), fl = "data-reka-collection-item";
function pl(e = {}) {
	let { key: t = "", isProvider: n = !1 } = e, r = `${t}CollectionProvider`, i;
	n ? (i = {
		collectionRef: /* @__PURE__ */ I(),
		itemMap: /* @__PURE__ */ I(/* @__PURE__ */ new Map())
	}, Un(r, i)) : i = Wn(r);
	let a = (e = !1) => {
		let t = i.collectionRef.value;
		if (!t) return [];
		let n = Array.from(t.querySelectorAll(`[${fl}]`)), r = Array.from(i.itemMap.value.values()).sort((e, t) => n.indexOf(e.ref) - n.indexOf(t.ref));
		return e ? r : r.filter((e) => e.ref.dataset.disabled !== "");
	}, o = /*#__PURE__*/ z({
		name: "CollectionSlot",
		inheritAttrs: !1,
		setup(e, { slots: t, attrs: n }) {
			let { primitiveElement: r, currentElement: a } = il();
			return Xn(a, () => {
				i.collectionRef.value = a.value;
			}), () => to(tl, {
				ref: r,
				...n
			}, t);
		}
	}), s = /*#__PURE__*/ z({
		name: "CollectionItem",
		inheritAttrs: !1,
		props: { value: { validator: () => !0 } },
		setup(e, { slots: t, attrs: n }) {
			let { primitiveElement: r, currentElement: a } = il();
			return Jn((t) => {
				if (a.value) {
					let n = qt(a.value);
					i.itemMap.value.set(n, {
						ref: a.value,
						value: e.value
					}), t(() => i.itemMap.value.delete(n));
				}
			}), () => to(tl, {
				...n,
				[fl]: "",
				ref: r
			}, t);
		}
	});
	return {
		getItems: a,
		reactiveItems: X(() => Array.from(i.itemMap.value.values())),
		itemMapSize: X(() => i.itemMap.value.size),
		CollectionSlot: o,
		CollectionItem: s
	};
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/reka-ui@2.9.10_vue@3.5.41_typescript@5.9.3_/node_modules/reka-ui/dist/VisuallyHidden/VisuallyHidden.js
var ml = /* @__PURE__ */ z({
	__name: "VisuallyHidden",
	props: {
		feature: {
			type: String,
			required: !1,
			default: "focusable"
		},
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1,
			default: "span"
		}
	},
	setup(e) {
		return (e, t) => (H(), W(L(rl), {
			as: e.as,
			"as-child": e.asChild,
			"aria-hidden": e.feature === "focusable" ? "true" : void 0,
			"data-hidden": e.feature === "fully-hidden" ? "" : void 0,
			tabindex: e.feature === "fully-hidden" ? "-1" : void 0,
			style: {
				position: "absolute",
				border: 0,
				width: "1px",
				height: "1px",
				padding: 0,
				margin: "-1px",
				overflow: "hidden",
				clip: "rect(0, 0, 0, 0)",
				clipPath: "inset(50%)",
				whiteSpace: "nowrap",
				wordWrap: "normal",
				top: "-1px",
				left: "-1px"
			}
		}, {
			default: R(() => [B(e.$slots, "default")]),
			_: 3
		}, 8, [
			"as",
			"as-child",
			"aria-hidden",
			"data-hidden",
			"tabindex"
		]));
	}
}), hl = /* @__PURE__ */ z({
	__name: "Label",
	props: {
		for: {
			type: String,
			required: !1
		},
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1,
			default: "label"
		}
	},
	setup(e) {
		let t = e;
		return Yc(), (e, n) => (H(), W(L(rl), Y(t, { onMousedown: n[0] ||= (e) => {
			!e.defaultPrevented && e.detail > 1 && e.preventDefault();
		} }), {
			default: R(() => [B(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), gl = 100, [_l, vl] = /*#__PURE__*/ Vc("ProgressRoot"), yl = (e) => typeof e == "number";
function bl(e, t) {
	return Uc(e) || yl(e) && !Number.isNaN(e) && e <= t && e >= 0 ? e : (console.error(`Invalid prop \`value\` of value \`${e}\` supplied to \`ProgressRoot\`. The \`value\` prop must be:
  - a positive number
  - less than the value passed to \`max\` (or ${gl} if no \`max\` prop is set)
  - \`null\`  or \`undefined\` if the progress is indeterminate.

Defaulting to \`null\`.`), null);
}
function xl(e) {
	return yl(e) && !Number.isNaN(e) && e > 0 ? e : (console.error(`Invalid prop \`max\` of value \`${e}\` supplied to \`ProgressRoot\`. Only numbers greater than 0 are valid max values. Defaulting to \`${gl}\`.`), gl);
}
var Sl = /* @__PURE__ */ z({
	__name: "ProgressRoot",
	props: {
		modelValue: {
			type: [Number, null],
			required: !1
		},
		max: {
			type: Number,
			required: !1,
			default: gl
		},
		getValueLabel: {
			type: Function,
			required: !1,
			default: (e, t) => yl(e) ? `${Math.round(e / t * gl)}%` : void 0
		},
		getValueText: {
			type: Function,
			required: !1
		},
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1
		}
	},
	emits: ["update:modelValue", "update:max"],
	setup(e, { emit: t }) {
		let n = e, r = t;
		Yc();
		let i = Rs(n, "modelValue", r, { passive: n.modelValue === void 0 }), a = Rs(n, "max", r, { passive: n.max === void 0 });
		Xn(() => i.value, async (e) => {
			let t = bl(e, n.max);
			t !== e && (await An(), i.value = t);
		}, { immediate: !0 }), Xn(() => n.max, (e) => {
			let t = xl(n.max);
			t !== e && (a.value = t);
		}, { immediate: !0 });
		let o = X(() => Uc(i.value) ? "indeterminate" : i.value === a.value ? "complete" : "loading");
		return vl({
			modelValue: i,
			max: a,
			progressState: o
		}), (e, t) => (H(), W(L(rl), {
			"as-child": e.asChild,
			as: e.as,
			"aria-valuemax": L(a),
			"aria-valuemin": 0,
			"aria-valuenow": yl(L(i)) ? L(i) : void 0,
			"aria-valuetext": e.getValueText?.(L(i), L(a)),
			"aria-label": e.getValueLabel(L(i), L(a)),
			role: "progressbar",
			"data-state": o.value,
			"data-value": L(i) ?? void 0,
			"data-max": L(a)
		}, {
			default: R(() => [B(e.$slots, "default", { modelValue: L(i) })]),
			_: 3
		}, 8, [
			"as-child",
			"as",
			"aria-valuemax",
			"aria-valuenow",
			"aria-valuetext",
			"aria-label",
			"data-state",
			"data-value",
			"data-max"
		]));
	}
}), Cl = /* @__PURE__ */ z({
	__name: "ProgressIndicator",
	props: {
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1
		}
	},
	setup(e) {
		let t = e, n = _l();
		return Yc(), (e, r) => (H(), W(L(rl), Y(t, {
			"data-state": L(n).progressState.value,
			"data-value": L(n).modelValue?.value ?? void 0,
			"data-max": L(n).max.value
		}), {
			default: R(() => [B(e.$slots, "default")]),
			_: 3
		}, 16, [
			"data-state",
			"data-value",
			"data-max"
		]));
	}
}), wl = /* @__PURE__ */ z({
	__name: "ToastAnnounceExclude",
	props: {
		altText: {
			type: String,
			required: !1
		},
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1
		}
	},
	setup(e) {
		return (e, t) => (H(), W(L(rl), {
			as: e.as,
			"as-child": e.asChild,
			"data-reka-toast-announce-exclude": "",
			"data-reka-toast-announce-alt": e.altText || void 0
		}, {
			default: R(() => [B(e.$slots, "default")]),
			_: 3
		}, 8, [
			"as",
			"as-child",
			"data-reka-toast-announce-alt"
		]));
	}
}), [Tl, El] = /*#__PURE__*/ Vc("ToastProvider"), Dl = /* @__PURE__ */ z({
	inheritAttrs: !1,
	__name: "ToastProvider",
	props: {
		label: {
			type: String,
			required: !1,
			default: "Notification"
		},
		duration: {
			type: Number,
			required: !1,
			default: 5e3
		},
		disableSwipe: {
			type: Boolean,
			required: !1
		},
		swipeDirection: {
			type: String,
			required: !1,
			default: "right"
		},
		swipeThreshold: {
			type: Number,
			required: !1,
			default: 50
		}
	},
	setup(e) {
		let t = e, { label: n, duration: r, disableSwipe: i, swipeDirection: a, swipeThreshold: o } = /* @__PURE__ */ on(t);
		pl({ isProvider: !0 });
		let s = /* @__PURE__ */ I(), c = /* @__PURE__ */ I(0), l = /* @__PURE__ */ I(!1), u = /* @__PURE__ */ I(!1);
		if (t.label && typeof t.label == "string" && !t.label.trim()) throw Error("Invalid prop `label` supplied to `ToastProvider`. Expected non-empty `string`.");
		return El({
			label: n,
			duration: r,
			disableSwipe: i,
			swipeDirection: a,
			swipeThreshold: o,
			toastCount: c,
			viewport: s,
			onViewportChange(e) {
				s.value = e;
			},
			onToastAdd() {
				c.value++;
			},
			onToastRemove() {
				c.value--;
			},
			isFocusedToastEscapeKeyDownRef: l,
			isClosePausedRef: u
		}), (e, t) => B(e.$slots, "default");
	}
}), Ol = /* @__PURE__ */ z({
	__name: "ToastAnnounce",
	setup(e) {
		let t = Tl(), n = Os(1e3), r = /* @__PURE__ */ I(!1), i = 0, a = 0;
		return ps && (i = requestAnimationFrame(() => {
			a = requestAnimationFrame(() => {
				r.value = !0;
			});
		}), Ee(() => {
			cancelAnimationFrame(i), cancelAnimationFrame(a);
		})), (e, i) => L(n) || r.value ? (H(), W(L(ml), {
			key: 0,
			feature: "fully-hidden"
		}, {
			default: R(() => [q(M(L(t).label.value) + " ", 1), B(e.$slots, "default")]),
			_: 3
		})) : J("v-if", !0);
	}
}), kl = "toast.viewportPause", Al = "toast.viewportResume";
function jl(e, t, n) {
	let r = n.originalEvent.currentTarget, i = new CustomEvent(e, {
		bubbles: !1,
		cancelable: !0,
		detail: n
	});
	t && r.addEventListener(e, t, { once: !0 }), r.dispatchEvent(i);
}
function Ml(e, t, n = 0) {
	let r = Math.abs(e.x), i = Math.abs(e.y), a = r > i;
	return t === "left" || t === "right" ? a && r > n : !a && i > n;
}
function Nl(e) {
	return e.nodeType === e.ELEMENT_NODE;
}
function Pl(e) {
	let t = [];
	return Array.from(e.childNodes).forEach((e) => {
		if (e.nodeType === e.TEXT_NODE && e.textContent && t.push(e.textContent), Nl(e)) {
			let n = e.ariaHidden || e.hidden || e.style.display === "none", r = e.dataset.rekaToastAnnounceExclude === "";
			if (!n) {
				if (r) {
					let n = e.dataset.rekaToastAnnounceAlt;
					n && t.push(n);
				} else t.push(...Pl(e));
			}
		}
	}), t;
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/reka-ui@2.9.10_vue@3.5.41_typescript@5.9.3_/node_modules/reka-ui/dist/Toast/ToastRootImpl.js
var [Fl, Il] = /*#__PURE__*/ Vc("ToastRoot"), Ll = /* @__PURE__ */ z({
	inheritAttrs: !1,
	__name: "ToastRootImpl",
	props: {
		type: {
			type: String,
			required: !1
		},
		open: {
			type: Boolean,
			required: !1,
			default: !1
		},
		duration: {
			type: Number,
			required: !1
		},
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1,
			default: "li"
		}
	},
	emits: [
		"close",
		"escapeKeyDown",
		"pause",
		"resume",
		"swipeStart",
		"swipeMove",
		"swipeCancel",
		"swipeEnd"
	],
	setup(e, { emit: t }) {
		let n = e, r = t, { forwardRef: i, currentElement: a } = Yc(), { CollectionItem: o } = pl(), s = Tl(), c = /* @__PURE__ */ I(null), l = /* @__PURE__ */ I(null), u = X(() => typeof n.duration == "number" ? n.duration : s.duration.value), d = /* @__PURE__ */ I(0), f = /* @__PURE__ */ I(u.value), p = /* @__PURE__ */ I(0), m = /* @__PURE__ */ I(u.value), h = Is(() => {
			let e = Date.now() - d.value;
			m.value = Math.max(f.value - e, 0);
		}, { fpsLimit: 60 });
		function g(e) {
			e <= 0 || e === Infinity || ps && (window.clearTimeout(p.value), d.value = Date.now(), p.value = window.setTimeout(_, e));
		}
		function _(e) {
			let t = e?.pointerType === "";
			a.value?.contains(Hc()) && t && s.viewport.value?.focus(), t && (s.isClosePausedRef.value = !1), r("close");
		}
		let v = X(() => a.value ? Pl(a.value) : null);
		if (n.type && !["foreground", "background"].includes(n.type)) throw Error("Invalid prop `type` supplied to `Toast`. Expected `foreground | background`.");
		return Jn((e) => {
			let t = s.viewport.value;
			if (t) {
				let e = () => {
					g(f.value), h.resume(), r("resume");
				}, n = () => {
					let e = Date.now() - d.value;
					f.value -= e, window.clearTimeout(p.value), h.pause(), r("pause");
				};
				return t.addEventListener(kl, n), t.addEventListener(Al, e), () => {
					t.removeEventListener(kl, n), t.removeEventListener(Al, e);
				};
			}
		}), Xn(() => [n.open, u.value], () => {
			f.value = u.value, n.open && !s.isClosePausedRef.value && g(u.value);
		}, { immediate: !0 }), Fs("Escape", (e) => {
			r("escapeKeyDown", e), e.defaultPrevented || (s.isFocusedToastEscapeKeyDownRef.value = !0, _());
		}), Pr(() => {
			s.onToastAdd();
		}), Rr(() => {
			s.onToastRemove();
		}), Il({ onClose: _ }), (e, t) => (H(), U(V, null, [v.value ? (H(), W(Ol, {
			key: 0,
			role: "alert",
			"aria-live": e.type === "foreground" ? "assertive" : "polite"
		}, {
			default: R(() => [J("\n      Render each chunk as its own text node so screen readers get the\n      natural pause break between nodes (see comment in utils.ts).\n      Interpolating the array directly with `{{ announceTextContent }}`\n      would route through Vue's `toDisplayString`, which JSON-stringifies\n      arrays — the live region would then announce literal `[`, quotes\n      and commas instead of the toast title and description.\n    "), (H(!0), U(V, null, Jr(v.value, (e, t) => (H(), U(V, { key: t }, [q(M(e), 1)], 64))), 128))]),
			_: 1
		}, 8, ["aria-live"])) : J("v-if", !0), L(s).viewport.value ? (H(), W(dr, {
			key: 1,
			to: L(s).viewport.value
		}, [K(L(o), null, {
			default: R(() => [K(L(rl), Y({
				ref: L(i),
				tabindex: "0"
			}, e.$attrs, {
				as: e.as,
				"as-child": e.asChild,
				"data-state": e.open ? "open" : "closed",
				"data-swipe-direction": L(s).swipeDirection.value,
				style: L(s).disableSwipe.value ? void 0 : {
					userSelect: "none",
					touchAction: "none"
				},
				onPointerdown: t[0] ||= Go((e) => {
					L(s).disableSwipe.value || (c.value = {
						x: e.clientX,
						y: e.clientY
					});
				}, ["left"]),
				onPointermove: t[1] ||= (e) => {
					if (L(s).disableSwipe.value || !c.value) return;
					let t = e.clientX - c.value.x, n = e.clientY - c.value.y, i = !!l.value, a = ["left", "right"].includes(L(s).swipeDirection.value), o = ["left", "up"].includes(L(s).swipeDirection.value) ? Math.min : Math.max, u = a ? o(0, t) : 0, d = a ? 0 : o(0, n), f = e.pointerType === "touch" ? 10 : 2, p = {
						x: u,
						y: d
					}, m = {
						originalEvent: e,
						delta: p
					};
					i ? (l.value = p, L(jl)(L("toast.swipeMove"), (e) => r("swipeMove", e), m)) : L(Ml)(p, L(s).swipeDirection.value, f) ? (l.value = p, L(jl)(L("toast.swipeStart"), (e) => r("swipeStart", e), m), e.target.setPointerCapture(e.pointerId)) : (Math.abs(t) > f || Math.abs(n) > f) && (c.value = null);
				},
				onPointerup: t[2] ||= (e) => {
					if (L(s).disableSwipe.value) return;
					let t = l.value, n = e.target;
					if (n.hasPointerCapture(e.pointerId) && n.releasePointerCapture(e.pointerId), l.value = null, c.value = null, t) {
						let n = e.currentTarget, i = {
							originalEvent: e,
							delta: t
						};
						L(Ml)(t, L(s).swipeDirection.value, L(s).swipeThreshold.value) ? L(jl)(L("toast.swipeEnd"), (e) => r("swipeEnd", e), i) : L(jl)(L("toast.swipeCancel"), (e) => r("swipeCancel", e), i), n?.addEventListener("click", (e) => e.preventDefault(), { once: !0 });
					}
				}
			}), {
				default: R(() => [B(e.$slots, "default", {
					remaining: m.value,
					duration: u.value
				})]),
				_: 3
			}, 16, [
				"as",
				"as-child",
				"data-state",
				"data-swipe-direction",
				"style"
			])]),
			_: 3
		})], 8, ["to"])) : J("v-if", !0)], 64));
	}
}), Rl = /* @__PURE__ */ z({
	__name: "ToastClose",
	props: {
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1,
			default: "button"
		}
	},
	setup(e) {
		let t = e, n = Fl(), { forwardRef: r } = Yc();
		return (e, i) => (H(), W(wl, { "as-child": "" }, {
			default: R(() => [K(L(rl), Y(t, {
				ref: L(r),
				type: e.as === "button" ? "button" : void 0,
				onClick: L(n).onClose
			}), {
				default: R(() => [B(e.$slots, "default")]),
				_: 3
			}, 16, ["type", "onClick"])]),
			_: 3
		}));
	}
}), zl = /* @__PURE__ */ z({
	__name: "ToastAction",
	props: {
		altText: {
			type: String,
			required: !0
		},
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1
		}
	},
	setup(e) {
		if (!e.altText) throw Error("Missing prop `altText` expected on `ToastAction`");
		let { forwardRef: t } = Yc();
		return (e, n) => e.altText ? (H(), W(wl, {
			key: 0,
			"alt-text": e.altText,
			"as-child": ""
		}, {
			default: R(() => [K(Rl, {
				ref: L(t),
				as: e.as,
				"as-child": e.asChild
			}, {
				default: R(() => [B(e.$slots, "default")]),
				_: 3
			}, 8, ["as", "as-child"])]),
			_: 3
		}, 8, ["alt-text"])) : J("v-if", !0);
	}
}), Bl = /* @__PURE__ */ z({
	__name: "ToastDescription",
	props: {
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1
		}
	},
	setup(e) {
		let t = e;
		return Yc(), (e, n) => (H(), W(L(rl), j(Da(t)), {
			default: R(() => [B(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), Vl = /* @__PURE__ */ z({
	__name: "ToastPortal",
	props: {
		to: {
			type: null,
			required: !1
		},
		disabled: {
			type: Boolean,
			required: !1
		},
		defer: {
			type: Boolean,
			required: !1
		},
		forceMount: {
			type: Boolean,
			required: !1
		}
	},
	setup(e) {
		let t = e;
		return (e, n) => (H(), W(L(dl), j(Da(t)), {
			default: R(() => [B(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), Hl = /* @__PURE__ */ z({
	__name: "ToastRoot",
	props: {
		defaultOpen: {
			type: Boolean,
			required: !1,
			default: !0
		},
		forceMount: {
			type: Boolean,
			required: !1
		},
		type: {
			type: String,
			required: !1,
			default: "foreground"
		},
		open: {
			type: Boolean,
			required: !1,
			default: void 0
		},
		duration: {
			type: Number,
			required: !1
		},
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1,
			default: "li"
		}
	},
	emits: [
		"escapeKeyDown",
		"pause",
		"resume",
		"swipeStart",
		"swipeMove",
		"swipeCancel",
		"swipeEnd",
		"update:open"
	],
	setup(e, { emit: t }) {
		let n = e, r = t, { forwardRef: i } = Yc(), a = Rs(n, "open", r, {
			defaultValue: n.defaultOpen,
			passive: n.open === void 0
		});
		return (e, t) => (H(), W(L(el), { present: e.forceMount || L(a) }, {
			default: R(() => [K(Ll, Y({
				ref: L(i),
				open: L(a),
				type: e.type,
				as: e.as,
				"as-child": e.asChild,
				duration: e.duration
			}, e.$attrs, {
				onClose: t[0] ||= (e) => a.value = !1,
				onPause: t[1] ||= (e) => r("pause"),
				onResume: t[2] ||= (e) => r("resume"),
				onEscapeKeyDown: t[3] ||= (e) => r("escapeKeyDown", e),
				onSwipeStart: t[4] ||= (e) => {
					r("swipeStart", e), e.defaultPrevented || e.currentTarget.setAttribute("data-swipe", "start");
				},
				onSwipeMove: t[5] ||= (e) => {
					if (r("swipeMove", e), !e.defaultPrevented) {
						let { x: t, y: n } = e.detail.delta, r = e.currentTarget;
						r.setAttribute("data-swipe", "move"), r.style.setProperty("--reka-toast-swipe-move-x", `${t}px`), r.style.setProperty("--reka-toast-swipe-move-y", `${n}px`);
					}
				},
				onSwipeCancel: t[6] ||= (e) => {
					if (r("swipeCancel", e), !e.defaultPrevented) {
						let t = e.currentTarget;
						t.setAttribute("data-swipe", "cancel"), t.style.removeProperty("--reka-toast-swipe-move-x"), t.style.removeProperty("--reka-toast-swipe-move-y"), t.style.removeProperty("--reka-toast-swipe-end-x"), t.style.removeProperty("--reka-toast-swipe-end-y");
					}
				},
				onSwipeEnd: t[7] ||= (e) => {
					if (r("swipeEnd", e), !e.defaultPrevented) {
						let { x: t, y: n } = e.detail.delta, r = e.currentTarget;
						r.setAttribute("data-swipe", "end"), r.style.removeProperty("--reka-toast-swipe-move-x"), r.style.removeProperty("--reka-toast-swipe-move-y"), r.style.setProperty("--reka-toast-swipe-end-x", `${t}px`), r.style.setProperty("--reka-toast-swipe-end-y", `${n}px`), a.value = !1;
					}
				}
			}), {
				default: R(({ remaining: t, duration: n }) => [B(e.$slots, "default", {
					remaining: t,
					duration: n,
					open: L(a)
				})]),
				_: 3
			}, 16, [
				"open",
				"type",
				"as",
				"as-child",
				"duration"
			])]),
			_: 3
		}, 8, ["present"]));
	}
}), Ul = /* @__PURE__ */ z({
	__name: "ToastTitle",
	props: {
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1
		}
	},
	setup(e) {
		let t = e;
		return Yc(), (e, n) => (H(), W(L(rl), j(Da(t)), {
			default: R(() => [B(e.$slots, "default")]),
			_: 3
		}, 16));
	}
}), Wl = /* @__PURE__ */ z({
	__name: "FocusProxy",
	emits: ["focusFromOutsideViewport"],
	setup(e, { emit: t }) {
		let n = t, r = Tl();
		return (e, t) => (H(), W(L(ml), {
			tabindex: "0",
			style: { position: "fixed" },
			onFocus: t[0] ||= (e) => {
				let t = e.relatedTarget;
				L(r).viewport.value?.contains(t) || n("focusFromOutsideViewport");
			}
		}, {
			default: R(() => [B(e.$slots, "default")]),
			_: 3
		}));
	}
}), Gl = /* @__PURE__ */ z({
	inheritAttrs: !1,
	__name: "ToastViewport",
	props: {
		hotkey: {
			type: Array,
			required: !1,
			default: () => ["F8"]
		},
		label: {
			type: [String, Function],
			required: !1,
			default: "Notifications ({hotkey})"
		},
		asChild: {
			type: Boolean,
			required: !1
		},
		as: {
			type: null,
			required: !1,
			default: "ol"
		}
	},
	setup(e) {
		let { hotkey: t, label: n } = /* @__PURE__ */ on(e), { forwardRef: r, currentElement: i } = Yc(), { CollectionSlot: a, getItems: o } = pl(), s = Tl(), c = X(() => s.toastCount.value > 0), l = /* @__PURE__ */ I(), u = /* @__PURE__ */ I(), d = /Key/g, f = /Digit/g, p = X(() => t.value.join("+").replace(d, "").replace(f, ""));
		Fs(t.value, () => {
			i.value.focus();
		}), Pr(() => {
			s.onViewportChange(i.value);
		}), Jn((e) => {
			let t = i.value;
			if (c.value && t) {
				let n = () => {
					if (!s.isClosePausedRef.value) {
						let e = new CustomEvent(kl);
						t.dispatchEvent(e), s.isClosePausedRef.value = !0;
					}
				}, r = () => {
					if (s.isClosePausedRef.value) {
						let e = new CustomEvent(Al);
						t.dispatchEvent(e), s.isClosePausedRef.value = !1;
					}
				}, i = (e) => {
					t.contains(e.relatedTarget) || r();
				}, a = () => {
					t.contains(Hc()) || r();
				}, o = (e) => {
					let n = e.altKey || e.ctrlKey || e.metaKey;
					if (e.key === "Tab" && !n) {
						let n = Hc(), r = e.shiftKey;
						if (e.target === t && r) {
							l.value?.focus();
							return;
						}
						let i = m({ tabbingDirection: r ? "backwards" : "forwards" }), a = i.findIndex((e) => e === n);
						sl(i.slice(a + 1)) ? e.preventDefault() : r ? l.value?.focus() : u.value?.focus();
					}
				};
				t.addEventListener("focusin", n), t.addEventListener("focusout", i), t.addEventListener("pointermove", n), t.addEventListener("pointerleave", a), t.addEventListener("keydown", o), window.addEventListener("blur", n), window.addEventListener("focus", r), e(() => {
					t.removeEventListener("focusin", n), t.removeEventListener("focusout", i), t.removeEventListener("pointermove", n), t.removeEventListener("pointerleave", a), t.removeEventListener("keydown", o), window.removeEventListener("blur", n), window.removeEventListener("focus", r);
				});
			}
		});
		function m({ tabbingDirection: e }) {
			let t = o().map((e) => e.ref).map((t) => {
				let n = [t, ...cl(t)];
				return e === "forwards" ? n : n.reverse();
			});
			return (e === "forwards" ? t.reverse() : t).flat();
		}
		return (e, t) => (H(), W(L(ol), {
			role: "region",
			"aria-label": typeof L(n) == "string" ? L(n).replace("{hotkey}", p.value) : L(n)(p.value),
			tabindex: "-1",
			style: le({ pointerEvents: c.value ? void 0 : "none" })
		}, {
			default: R(() => [
				c.value ? (H(), W(Wl, {
					key: 0,
					ref: (e) => {
						e && (l.value = L(js)(e));
					},
					onFocusFromOutsideViewport: t[0] ||= () => {
						let e = m({ tabbingDirection: "forwards" });
						L(sl)(e);
					}
				}, null, 512)) : J("v-if", !0),
				K(L(a), null, {
					default: R(() => [K(L(rl), Y({
						ref: L(r),
						tabindex: "-1",
						as: e.as,
						"as-child": e.asChild
					}, e.$attrs), {
						default: R(() => [B(e.$slots, "default")]),
						_: 3
					}, 16, ["as", "as-child"])]),
					_: 3
				}),
				c.value ? (H(), W(Wl, {
					key: 1,
					ref: (e) => {
						e && (u.value = L(js)(e));
					},
					onFocusFromOutsideViewport: t[1] ||= () => {
						let e = m({ tabbingDirection: "backwards" });
						L(sl)(e);
					}
				}, null, 512)) : J("v-if", !0)
			]),
			_: 3
		}, 8, ["aria-label", "style"]));
	}
}), [Kl, ql] = /*#__PURE__*/ Vc("TooltipProvider"), Jl = /* @__PURE__ */ z({
	inheritAttrs: !1,
	__name: "TooltipProvider",
	props: {
		delayDuration: {
			type: Number,
			required: !1,
			default: 700
		},
		skipDelayDuration: {
			type: Number,
			required: !1,
			default: 300
		},
		disableHoverableContent: {
			type: Boolean,
			required: !1,
			default: !1
		},
		disableClosingTrigger: {
			type: Boolean,
			required: !1
		},
		disabled: {
			type: Boolean,
			required: !1
		},
		ignoreNonKeyboardFocus: {
			type: Boolean,
			required: !1,
			default: !1
		},
		content: {
			type: Object,
			required: !1
		}
	},
	setup(e) {
		let { delayDuration: t, skipDelayDuration: n, disableHoverableContent: r, disableClosingTrigger: i, ignoreNonKeyboardFocus: a, disabled: o, content: s } = /* @__PURE__ */ on(e);
		Yc();
		let c = /* @__PURE__ */ I(!0), l = /* @__PURE__ */ I(!1), { start: u, stop: d } = Ds(() => {
			c.value = !0;
		}, n, { immediate: !1 });
		return ql({
			isOpenDelayed: c,
			delayDuration: t,
			onOpen() {
				d(), c.value = !1;
			},
			onClose() {
				u();
			},
			isPointerInTransitRef: l,
			disableHoverableContent: r,
			disableClosingTrigger: i,
			disabled: o,
			ignoreNonKeyboardFocus: a,
			content: s
		}), (e, t) => B(e.$slots, "default");
	}
}), [Yl, Xl] = Vc("UTheme", "RootContext"), Zl = { defaults: X(() => ({})) };
function Ql(e = Zl) {
	return Yl(e);
}
function $l(e) {
	return e.replace(/-(\w)/g, (e, t) => t.toUpperCase());
}
function eu(e) {
	return e.replace(/[A-Z]/g, (e) => `-${e.toLowerCase()}`);
}
function tu(e, t) {
	return !e || !e.props ? !1 : e.props[$l(t)] !== void 0 || e.props[eu(t)] !== void 0;
}
function nu(e, t) {
	let n = La(), { defaults: r } = Ql(), i = bc();
	return new Proxy(t, {
		get(t, a, o) {
			if (a === "__v_isReactive") return !0;
			if (a === "__v_raw") return t;
			let s = Reflect.get(t, a, o);
			if (typeof a != "string") return s;
			let c = e.includes(".") ? Dc(r.value, e) : r.value[e];
			if (a === "ui") {
				let e = c?.ui;
				return !s && !e ? s : rs(s ?? {}, e ?? {});
			}
			if (n && tu(n.vnode, a)) return s;
			let l = c?.[a];
			if (l !== void 0) return l;
			let u = n?.type?.props?.[a];
			return u && Object.prototype.hasOwnProperty.call(u, "default") ? s : (e.includes(".") ? Dc(i.ui ?? {}, e) : i.ui?.[e])?.defaultVariants?.[a];
		},
		has: (e, t) => Reflect.has(e, t),
		ownKeys: (e) => Reflect.ownKeys(e),
		getOwnPropertyDescriptor: (e, t) => Reflect.getOwnPropertyDescriptor(e, t)
	});
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/@nuxt+ui@4.9.0_patch_hash=4ccf9386c7cac79ac933037f07f03c58e3649f1cf82050f5b2514226e1e46_6210cc9a3324cad860a299c7c3e3caac/node_modules/@nuxt/ui/dist/runtime/composables/useForwardProps.js
function ru(e, t) {
	let n = t ? Jc(t) : {};
	return X(() => {
		let t = /* @__PURE__ */ F(e) ? e.value : e, r = { ...n };
		for (let e in t) {
			let n = t[e];
			n !== void 0 && (r[e] = n);
		}
		return r;
	});
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/@nuxt+ui@4.9.0_patch_hash=4ccf9386c7cac79ac933037f07f03c58e3649f1cf82050f5b2514226e1e46_6210cc9a3324cad860a299c7c3e3caac/node_modules/@nuxt/ui/dist/runtime/composables/useComponentIcons.js
function iu(e) {
	let t = bc(), n = X(() => en(e)), r = X(() => n.value.icon && n.value.leading || n.value.icon && !n.value.trailing || n.value.loading && !n.value.trailing || !!n.value.leadingIcon);
	return {
		isLeading: r,
		isTrailing: X(() => n.value.icon && n.value.trailing || n.value.loading && n.value.trailing || !!n.value.trailingIcon && n.value.trailing !== !1),
		leadingIconName: X(() => n.value.loading ? n.value.loadingIcon || t.ui.icons.loading : n.value.leadingIcon || n.value.icon),
		trailingIconName: X(() => n.value.loading && !r.value ? n.value.loadingIcon || t.ui.icons.loading : n.value.trailingIcon || n.value.icon)
	};
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/@nuxt+ui@4.9.0_patch_hash=4ccf9386c7cac79ac933037f07f03c58e3649f1cf82050f5b2514226e1e46_6210cc9a3324cad860a299c7c3e3caac/node_modules/@nuxt/ui/dist/runtime/composables/useFieldGroup.js
var au = Symbol("nuxt-ui.field-group");
function ou(e) {
	let t = Wn(au, void 0);
	return {
		orientation: X(() => t?.value.orientation),
		size: X(() => e?.size ?? t?.value.size)
	};
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/@nuxt+ui@4.9.0_patch_hash=4ccf9386c7cac79ac933037f07f03c58e3649f1cf82050f5b2514226e1e46_6210cc9a3324cad860a299c7c3e3caac/node_modules/@nuxt/ui/dist/runtime/composables/useFormField.js
var su = Symbol("nuxt-ui.form-options"), cu = Symbol("nuxt-ui.form-events"), lu = Symbol("nuxt-ui.form-field"), uu = Symbol("nuxt-ui.input-id"), du = Symbol("nuxt-ui.form-inputs"), fu = Symbol("nuxt-ui.form-loading"), pu = Symbol("nuxt-ui.form-errors");
function mu(e, t) {
	let n = Wn(su, void 0), r = Wn(cu, void 0), i = Wn(lu, void 0), a = Wn(uu, void 0);
	Un(lu, void 0), i && a && (t?.bind === !1 ? a.value = void 0 : e?.id && (a.value = e?.id));
	function o(e, t, n) {
		r && i && t && r.emit({
			type: e,
			name: t,
			eager: n
		});
	}
	function s() {
		o("blur", i?.value.name);
	}
	function c() {
		o("focus", i?.value.name);
	}
	function l() {
		o("change", i?.value.name);
	}
	let u = Es(() => {
		o("input", i?.value.name, !t?.deferInputValidation || i?.value.eagerValidation);
	}, i?.value.validateOnInputDelay ?? n?.value.validateOnInputDelay ?? 0);
	return {
		id: X(() => e?.id ?? a?.value),
		name: X(() => e?.name ?? i?.value.name),
		size: X(() => e?.size ?? i?.value.size),
		color: X(() => i?.value.error ? "error" : e?.color),
		highlight: X(() => i?.value.error ? !0 : e?.highlight),
		disabled: X(() => n?.value.disabled || e?.disabled),
		emitFormBlur: s,
		emitFormInput: u,
		emitFormChange: l,
		emitFormFocus: c,
		ariaAttrs: X(() => {
			if (!i?.value) return;
			let e = [
				"error",
				"hint",
				"description",
				"help"
			].filter((e) => i?.value?.[e]).map((e) => `${i?.value.ariaId}-${e}`) || [], t = { "aria-invalid": !!i?.value.error };
			return e.length > 0 && (t["aria-describedby"] = e.join(" ")), t;
		})
	};
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/tailwind-variants@3.2.2_tailwind-merge@3.6.0_tailwindcss@4.3.2/node_modules/tailwind-variants/dist/chunk-LQJYWU4O.js
var hu = /\s+/g, gu = (e) => typeof e != "string" || !e ? e : e.replace(hu, " ").trim(), _u = (...e) => {
	let t = [], n = (e) => {
		if (!e && e !== 0 && e !== 0n) return;
		if (Array.isArray(e)) {
			for (let t = 0, r = e.length; t < r; t++) n(e[t]);
			return;
		}
		let r = typeof e;
		if (r === "string" || r === "number" || r === "bigint") {
			if (r === "number" && e !== e) return;
			t.push(String(e));
		} else if (r === "object") {
			let n = Object.keys(e);
			for (let r = 0, i = n.length; r < i; r++) {
				let i = n[r];
				e[i] && t.push(i);
			}
		}
	};
	for (let t = 0, r = e.length; t < r; t++) {
		let r = e[t];
		r != null && n(r);
	}
	return t.length > 0 ? gu(t.join(" ")) : void 0;
}, vu = (e) => e === !1 ? "false" : e === !0 ? "true" : e === 0 ? "0" : e, yu = (e) => {
	if (!e || typeof e != "object") return !0;
	for (let t in e) return !1;
	return !0;
}, bu = (e, t) => {
	if (e === t) return !0;
	if (!e || !t) return !1;
	let n = Object.keys(e), r = Object.keys(t);
	if (n.length !== r.length) return !1;
	for (let i = 0; i < n.length; i++) {
		let a = n[i];
		if (!r.includes(a) || e[a] !== t[a]) return !1;
	}
	return !0;
}, xu = (e, t) => {
	for (let n in t) if (Object.prototype.hasOwnProperty.call(t, n)) {
		let r = t[n];
		e[n] = n in e ? _u(e[n], r) : r;
	}
	return e;
}, Su = (e, t) => {
	for (let n = 0; n < e.length; n++) {
		let r = e[n];
		Array.isArray(r) ? Su(r, t) : r && t.push(r);
	}
}, Cu = (...e) => {
	let t = [];
	Su(e, t);
	let n = [];
	for (let e = 0; e < t.length; e++) t[e] && n.push(t[e]);
	return n;
}, wu = (e, t) => {
	let n = {};
	for (let r in e) {
		let i = e[r];
		if (r in t) {
			let e = t[r];
			n[r] = Array.isArray(i) || Array.isArray(e) ? Cu(e, i) : typeof i == "object" && typeof e == "object" && i && e ? wu(i, e) : e + " " + i;
		} else n[r] = i;
	}
	for (let r in t) r in e || (n[r] = t[r]);
	return n;
}, Tu = {
	twMerge: !0,
	twMergeConfig: {}
};
function Eu() {
	let e = null, t = {}, n = !1;
	return {
		get cachedTwMerge() {
			return e;
		},
		set cachedTwMerge(t) {
			e = t;
		},
		get cachedTwMergeConfig() {
			return t;
		},
		set cachedTwMergeConfig(e) {
			t = e;
		},
		get didTwMergeConfigChange() {
			return n;
		},
		set didTwMergeConfigChange(e) {
			n = e;
		},
		reset() {
			e = null, t = {}, n = !1;
		}
	};
}
var Du = Eu(), Ou = (e) => {
	let t = (t, n) => {
		let { extend: r = null, slots: i = {}, variants: a = {}, compoundVariants: o = [], compoundSlots: s = [], defaultVariants: c = {} } = t, l = {
			...Tu,
			...n
		}, u = r?.base ? _u(r.base, t?.base) : t?.base, d = r?.variants && !yu(r.variants) ? wu(a, r.variants) : a, f = r?.defaultVariants && !yu(r.defaultVariants) ? {
			...r.defaultVariants,
			...c
		} : c;
		!yu(l.twMergeConfig) && !bu(l.twMergeConfig, Du.cachedTwMergeConfig) && (Du.didTwMergeConfigChange = !0, Du.cachedTwMergeConfig = l.twMergeConfig);
		let p = yu(r?.slots), m = yu(i) ? {} : {
			base: _u(t?.base, p && r?.base),
			...i
		}, h = p ? m : xu({ ...r?.slots }, yu(m) ? { base: t?.base } : m), g = yu(r?.compoundVariants) ? o : Cu(r?.compoundVariants, o), _ = (t) => {
			if (yu(d) && yu(i) && p) return e(u, t?.class, t?.className)(l);
			if (g && !Array.isArray(g)) throw TypeError(`The "compoundVariants" prop must be an array. Received: ${typeof g}`);
			if (s && !Array.isArray(s)) throw TypeError(`The "compoundSlots" prop must be an array. Received: ${typeof s}`);
			let n = (e, n = d, r = null, i = null) => {
				let a = n[e];
				if (!a || yu(a)) return null;
				let o = i?.[e] ?? t?.[e];
				if (o === null) return null;
				let s = vu(o);
				if (typeof s == "object") return null;
				let c = f?.[e];
				return a[(s ?? vu(c)) || "false"];
			}, r = () => {
				if (!d) return null;
				let e = Object.keys(d), t = [];
				for (let r = 0; r < e.length; r++) {
					let i = n(e[r], d);
					i && t.push(i);
				}
				return t;
			}, a = (e, t) => {
				if (!d || typeof d != "object") return null;
				let r = [];
				for (let i in d) {
					let a = n(i, d, e, t), o = e === "base" && typeof a == "string" ? a : a && a[e];
					o && r.push(o);
				}
				return r;
			}, o = {};
			for (let e in t) {
				let n = t[e];
				n !== void 0 && (o[e] = n);
			}
			let c = (e, n) => {
				let r = typeof t?.[e] == "object" ? { [e]: t[e]?.initial } : {};
				return {
					...f,
					...o,
					...r,
					...n
				};
			}, m = (e = [], t) => {
				let n = [], r = e.length;
				for (let i = 0; i < r; i++) {
					let { class: r, className: a, ...o } = e[i], s = !0, l = c(null, t);
					for (let e in o) {
						let t = o[e], n = l[e];
						if (Array.isArray(t)) {
							if (!t.includes(n)) {
								s = !1;
								break;
							}
						} else {
							if ((t == null || t === !1) && (n == null || n === !1)) continue;
							if (n !== t) {
								s = !1;
								break;
							}
						}
					}
					s && (r && n.push(r), a && n.push(a));
				}
				return n;
			}, _ = (t) => {
				let n = m(g, t);
				if (!Array.isArray(n)) return n;
				let r = {}, i = e;
				for (let e = 0; e < n.length; e++) {
					let t = n[e];
					if (typeof t == "string") r.base = i(r.base, t)(l);
					else if (typeof t == "object") for (let e in t) r[e] = i(r[e], t[e])(l);
				}
				return r;
			}, v = (e) => {
				if (s.length < 1) return null;
				let t = {}, n = c(null, e);
				for (let e = 0; e < s.length; e++) {
					let { slots: r = [], class: i, className: a, ...o } = s[e];
					if (!yu(o)) {
						let e = !0;
						for (let t in o) {
							let r = n[t], i = o[t];
							if (r === void 0 || (Array.isArray(i) ? !i.includes(r) : i !== r)) {
								e = !1;
								break;
							}
						}
						if (!e) continue;
					}
					for (let e = 0; e < r.length; e++) {
						let n = r[e];
						t[n] || (t[n] = []), t[n].push([i, a]);
					}
				}
				return t;
			};
			if (!yu(i) || !p) {
				let t = {};
				if (typeof h == "object" && !yu(h)) {
					let n = e;
					for (let e in h) t[e] = (t) => {
						let r = _(t), i = v(t);
						return n(h[e], a(e, t), r ? r[e] : void 0, i ? i[e] : void 0, t?.class, t?.className)(l);
					};
				}
				return t;
			}
			return e(u, r(), m(g), t?.class, t?.className)(l);
		};
		return _.variantKeys = (() => {
			if (!(!d || typeof d != "object")) return Object.keys(d);
		})(), _.extend = r, _.base = u, _.slots = h, _.variants = d, _.defaultVariants = f, _.compoundSlots = s, _.compoundVariants = g, _;
	};
	return {
		tv: t,
		createTV: (e) => (n, r) => t(n, r ? wu(e, r) : e)
	};
}, ku = (e, t) => {
	let n = Array(e.length + t.length);
	for (let t = 0; t < e.length; t++) n[t] = e[t];
	for (let r = 0; r < t.length; r++) n[e.length + r] = t[r];
	return n;
}, Au = (e, t) => ({
	classGroupId: e,
	validator: t
}), ju = (e = /* @__PURE__ */ new Map(), t = null, n) => ({
	nextPart: e,
	validators: t,
	classGroupId: n
}), Mu = "-", Nu = [], Pu = "arbitrary..", Fu = (e) => {
	let t = Ru(e), { conflictingClassGroups: n, conflictingClassGroupModifiers: r } = e;
	return {
		getClassGroupId: (e) => {
			if (e.startsWith("[") && e.endsWith("]")) return Lu(e);
			let n = e.split(Mu);
			return Iu(n, +(n[0] === "" && n.length > 1), t);
		},
		getConflictingClassGroupIds: (e, t) => {
			if (t) {
				let t = r[e], i = n[e];
				return t ? i ? ku(i, t) : t : i || Nu;
			}
			return n[e] || Nu;
		}
	};
}, Iu = (e, t, n) => {
	if (e.length - t === 0) return n.classGroupId;
	let r = e[t], i = n.nextPart.get(r);
	if (i) {
		let n = Iu(e, t + 1, i);
		if (n) return n;
	}
	let a = n.validators;
	if (a === null) return;
	let o = t === 0 ? e.join(Mu) : e.slice(t).join(Mu), s = a.length;
	for (let e = 0; e < s; e++) {
		let t = a[e];
		if (t.validator(o)) return t.classGroupId;
	}
}, Lu = (e) => e.slice(1, -1).indexOf(":") === -1 ? void 0 : (() => {
	let t = e.slice(1, -1), n = t.indexOf(":"), r = t.slice(0, n);
	return r ? Pu + r : void 0;
})(), Ru = (e) => {
	let { theme: t, classGroups: n } = e;
	return zu(n, t);
}, zu = (e, t) => {
	let n = ju();
	for (let r in e) {
		let i = e[r];
		Bu(i, n, r, t);
	}
	return n;
}, Bu = (e, t, n, r) => {
	let i = e.length;
	for (let a = 0; a < i; a++) {
		let i = e[a];
		Vu(i, t, n, r);
	}
}, Vu = (e, t, n, r) => {
	if (typeof e == "string") {
		Hu(e, t, n);
		return;
	}
	if (typeof e == "function") {
		Uu(e, t, n, r);
		return;
	}
	Wu(e, t, n, r);
}, Hu = (e, t, n) => {
	let r = e === "" ? t : Gu(t, e);
	r.classGroupId = n;
}, Uu = (e, t, n, r) => {
	if (Ku(e)) {
		Bu(e(r), t, n, r);
		return;
	}
	t.validators === null && (t.validators = []), t.validators.push(Au(n, e));
}, Wu = (e, t, n, r) => {
	let i = Object.entries(e), a = i.length;
	for (let e = 0; e < a; e++) {
		let [a, o] = i[e];
		Bu(o, Gu(t, a), n, r);
	}
}, Gu = (e, t) => {
	let n = e, r = t.split(Mu), i = r.length;
	for (let e = 0; e < i; e++) {
		let t = r[e], i = n.nextPart.get(t);
		i || (i = ju(), n.nextPart.set(t, i)), n = i;
	}
	return n;
}, Ku = (e) => "isThemeGetter" in e && e.isThemeGetter === !0, qu = (e) => {
	if (e < 1) return {
		get: () => void 0,
		set: () => {}
	};
	let t = 0, n = Object.create(null), r = Object.create(null), i = (i, a) => {
		n[i] = a, t++, t > e && (t = 0, r = n, n = Object.create(null));
	};
	return {
		get(e) {
			let t = n[e];
			if (t !== void 0) return t;
			if ((t = r[e]) !== void 0) return i(e, t), t;
		},
		set(e, t) {
			e in n ? n[e] = t : i(e, t);
		}
	};
}, Ju = "!", Yu = ":", Xu = [], Zu = (e, t, n, r, i) => ({
	modifiers: e,
	hasImportantModifier: t,
	baseClassName: n,
	maybePostfixModifierPosition: r,
	isExternal: i
}), Qu = (e) => {
	let { prefix: t, experimentalParseClassName: n } = e, r = (e) => {
		let t = [], n = 0, r = 0, i = 0, a, o = e.length;
		for (let s = 0; s < o; s++) {
			let o = e[s];
			if (n === 0 && r === 0) {
				if (o === Yu) {
					t.push(e.slice(i, s)), i = s + 1;
					continue;
				}
				if (o === "/") {
					a = s;
					continue;
				}
			}
			o === "[" ? n++ : o === "]" ? n-- : o === "(" ? r++ : o === ")" && r--;
		}
		let s = t.length === 0 ? e : e.slice(i), c = s, l = !1;
		s.endsWith(Ju) ? (c = s.slice(0, -1), l = !0) : s.startsWith(Ju) && (c = s.slice(1), l = !0);
		let u = a && a > i ? a - i : void 0;
		return Zu(t, l, c, u);
	};
	if (t) {
		let e = t + Yu, n = r;
		r = (t) => t.startsWith(e) ? n(t.slice(e.length)) : Zu(Xu, !1, t, void 0, !0);
	}
	if (n) {
		let e = r;
		r = (t) => n({
			className: t,
			parseClassName: e
		});
	}
	return r;
}, $u = (e) => {
	let t = /* @__PURE__ */ new Map();
	return e.orderSensitiveModifiers.forEach((e, n) => {
		t.set(e, 1e6 + n);
	}), (e) => {
		let n = [], r = [];
		for (let i = 0; i < e.length; i++) {
			let a = e[i], o = a[0] === "[", s = t.has(a);
			o || s ? (r.length > 0 && (r.sort(), n.push(...r), r = []), n.push(a)) : r.push(a);
		}
		return r.length > 0 && (r.sort(), n.push(...r)), n;
	};
}, ed = (e) => ({
	cache: qu(e.cacheSize),
	parseClassName: Qu(e),
	sortModifiers: $u(e),
	postfixLookupClassGroupIds: td(e),
	...Fu(e)
}), td = (e) => {
	let t = Object.create(null), n = e.postfixLookupClassGroups;
	if (n) for (let e = 0; e < n.length; e++) t[n[e]] = !0;
	return t;
}, nd = /\s+/, rd = (e, t) => {
	let { parseClassName: n, getClassGroupId: r, getConflictingClassGroupIds: i, sortModifiers: a, postfixLookupClassGroupIds: o } = t, s = [], c = e.trim().split(nd), l = "";
	for (let e = c.length - 1; e >= 0; --e) {
		let t = c[e], { isExternal: u, modifiers: d, hasImportantModifier: f, baseClassName: p, maybePostfixModifierPosition: m } = n(t);
		if (u) {
			l = t + (l.length > 0 ? " " + l : l);
			continue;
		}
		let h = !!m, g;
		if (h) {
			g = r(p.substring(0, m));
			let e = g && o[g] ? r(p) : void 0;
			e && e !== g && (g = e, h = !1);
		} else g = r(p);
		if (!g) {
			if (!h) {
				l = t + (l.length > 0 ? " " + l : l);
				continue;
			}
			if (g = r(p), !g) {
				l = t + (l.length > 0 ? " " + l : l);
				continue;
			}
			h = !1;
		}
		let _ = d.length === 0 ? "" : d.length === 1 ? d[0] : a(d).join(":"), v = f ? _ + Ju : _, y = v + g;
		if (s.indexOf(y) > -1) continue;
		s.push(y);
		let b = i(g, h);
		for (let e = 0; e < b.length; ++e) {
			let t = b[e];
			s.push(v + t);
		}
		l = t + (l.length > 0 ? " " + l : l);
	}
	return l;
}, id = (...e) => {
	let t = 0, n, r, i = "";
	for (; t < e.length;) (n = e[t++]) && (r = ad(n)) && (i && (i += " "), i += r);
	return i;
}, ad = (e) => {
	if (typeof e == "string") return e;
	let t, n = "";
	for (let r = 0; r < e.length; r++) e[r] && (t = ad(e[r])) && (n && (n += " "), n += t);
	return n;
}, od = (e, ...t) => {
	let n, r, i, a, o = (o) => (n = ed(t.reduce((e, t) => t(e), e())), r = n.cache.get, i = n.cache.set, a = s, s(o)), s = (e) => {
		let t = r(e);
		if (t) return t;
		let a = rd(e, n);
		return i(e, a), a;
	};
	return a = o, (...e) => a(id(...e));
}, sd = [], cd = (e) => {
	let t = (t) => t[e] || sd;
	return t.isThemeGetter = !0, t;
}, ld = /^\[(?:(\w[\w-]*):)?(.+)\]$/i, ud = /^\((?:(\w[\w-]*):)?(.+)\)$/i, dd = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/, fd = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/, pd = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/, md = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/, hd = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/, gd = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/, _d = (e) => dd.test(e), Z = (e) => !!e && !Number.isNaN(Number(e)), vd = (e) => !!e && Number.isInteger(Number(e)), yd = (e) => e.endsWith("%") && Z(e.slice(0, -1)), bd = (e) => fd.test(e), xd = () => !0, Sd = (e) => pd.test(e) && !md.test(e), Cd = () => !1, wd = (e) => hd.test(e), Td = (e) => gd.test(e), Ed = (e) => !Q(e) && !$(e), Dd = (e) => e.startsWith("@container") && (e[10] === "/" && e[11] !== void 0 || e[11] === "s" && e[16] !== void 0 && e.startsWith("-size/", 10) || e[11] === "n" && e[18] !== void 0 && e.startsWith("-normal/", 10)), Od = (e) => Ud(e, qd, Cd), Q = (e) => ld.test(e), kd = (e) => Ud(e, Jd, Sd), Ad = (e) => Ud(e, Yd, Z), jd = (e) => Ud(e, Zd, xd), Md = (e) => Ud(e, Xd, Cd), Nd = (e) => Ud(e, Gd, Cd), Pd = (e) => Ud(e, Kd, Td), Fd = (e) => Ud(e, Qd, wd), $ = (e) => ud.test(e), Id = (e) => Wd(e, Jd), Ld = (e) => Wd(e, Xd), Rd = (e) => Wd(e, Gd), zd = (e) => Wd(e, qd), Bd = (e) => Wd(e, Kd), Vd = (e) => Wd(e, Qd, !0), Hd = (e) => Wd(e, Zd, !0), Ud = (e, t, n) => {
	let r = ld.exec(e);
	return r ? r[1] ? t(r[1]) : n(r[2]) : !1;
}, Wd = (e, t, n = !1) => {
	let r = ud.exec(e);
	return r ? r[1] ? t(r[1]) : n : !1;
}, Gd = (e) => e === "position" || e === "percentage", Kd = (e) => e === "image" || e === "url", qd = (e) => e === "length" || e === "size" || e === "bg-size", Jd = (e) => e === "length", Yd = (e) => e === "number", Xd = (e) => e === "family-name", Zd = (e) => e === "number" || e === "weight", Qd = (e) => e === "shadow", $d = () => {
	let e = cd("color"), t = cd("font"), n = cd("text"), r = cd("font-weight"), i = cd("tracking"), a = cd("leading"), o = cd("breakpoint"), s = cd("container"), c = cd("spacing"), l = cd("radius"), u = cd("shadow"), d = cd("inset-shadow"), f = cd("text-shadow"), p = cd("drop-shadow"), m = cd("blur"), h = cd("perspective"), g = cd("aspect"), _ = cd("ease"), v = cd("animate"), y = () => [
		"auto",
		"avoid",
		"all",
		"avoid-page",
		"page",
		"left",
		"right",
		"column"
	], b = () => [
		"center",
		"top",
		"bottom",
		"left",
		"right",
		"top-left",
		"left-top",
		"top-right",
		"right-top",
		"bottom-right",
		"right-bottom",
		"bottom-left",
		"left-bottom"
	], x = () => [
		...b(),
		$,
		Q
	], S = () => [
		"auto",
		"hidden",
		"clip",
		"visible",
		"scroll"
	], C = () => [
		"auto",
		"contain",
		"none"
	], w = () => [
		$,
		Q,
		c
	], T = () => [
		_d,
		"full",
		"auto",
		...w()
	], ee = () => [
		vd,
		"none",
		"subgrid",
		$,
		Q
	], E = () => [
		"auto",
		{ span: [
			"full",
			vd,
			$,
			Q
		] },
		vd,
		$,
		Q
	], D = () => [
		vd,
		"auto",
		$,
		Q
	], te = () => [
		"auto",
		"min",
		"max",
		"fr",
		$,
		Q
	], ne = () => [
		"start",
		"end",
		"center",
		"between",
		"around",
		"evenly",
		"stretch",
		"baseline",
		"center-safe",
		"end-safe"
	], re = () => [
		"start",
		"end",
		"center",
		"stretch",
		"center-safe",
		"end-safe"
	], ie = () => ["auto", ...w()], O = () => [
		_d,
		"auto",
		"full",
		"dvw",
		"dvh",
		"lvw",
		"lvh",
		"svw",
		"svh",
		"min",
		"max",
		"fit",
		...w()
	], ae = () => [
		_d,
		"screen",
		"full",
		"dvw",
		"lvw",
		"svw",
		"min",
		"max",
		"fit",
		...w()
	], oe = () => [
		_d,
		"screen",
		"full",
		"lh",
		"dvh",
		"lvh",
		"svh",
		"min",
		"max",
		"fit",
		...w()
	], k = () => [
		e,
		$,
		Q
	], se = () => [
		...b(),
		Rd,
		Nd,
		{ position: [$, Q] }
	], ce = () => ["no-repeat", { repeat: [
		"",
		"x",
		"y",
		"space",
		"round"
	] }], le = () => [
		"auto",
		"cover",
		"contain",
		zd,
		Od,
		{ size: [$, Q] }
	], ue = () => [
		yd,
		Id,
		kd
	], de = () => [
		"",
		"none",
		"full",
		l,
		$,
		Q
	], fe = () => [
		"",
		Z,
		Id,
		kd
	], pe = () => [
		"solid",
		"dashed",
		"dotted",
		"double"
	], A = () => [
		"normal",
		"multiply",
		"screen",
		"overlay",
		"darken",
		"lighten",
		"color-dodge",
		"color-burn",
		"hard-light",
		"soft-light",
		"difference",
		"exclusion",
		"hue",
		"saturation",
		"color",
		"luminosity"
	], j = () => [
		Z,
		yd,
		Rd,
		Nd
	], me = () => [
		"",
		"none",
		m,
		$,
		Q
	], he = () => [
		"none",
		Z,
		$,
		Q
	], ge = () => [
		"none",
		Z,
		$,
		Q
	], _e = () => [
		Z,
		$,
		Q
	], ve = () => [
		_d,
		"full",
		...w()
	];
	return {
		cacheSize: 500,
		theme: {
			animate: [
				"spin",
				"ping",
				"pulse",
				"bounce"
			],
			aspect: ["video"],
			blur: [bd],
			breakpoint: [bd],
			color: [xd],
			container: [bd],
			"drop-shadow": [bd],
			ease: [
				"in",
				"out",
				"in-out"
			],
			font: [Ed],
			"font-weight": [
				"thin",
				"extralight",
				"light",
				"normal",
				"medium",
				"semibold",
				"bold",
				"extrabold",
				"black"
			],
			"inset-shadow": [bd],
			leading: [
				"none",
				"tight",
				"snug",
				"normal",
				"relaxed",
				"loose"
			],
			perspective: [
				"dramatic",
				"near",
				"normal",
				"midrange",
				"distant",
				"none"
			],
			radius: [bd],
			shadow: [bd],
			spacing: ["px", Z],
			text: [bd],
			"text-shadow": [bd],
			tracking: [
				"tighter",
				"tight",
				"normal",
				"wide",
				"wider",
				"widest"
			]
		},
		classGroups: {
			aspect: [{ aspect: [
				"auto",
				"square",
				_d,
				Q,
				$,
				g
			] }],
			container: ["container"],
			"container-type": [{ "@container": [
				"",
				"normal",
				"size",
				$,
				Q
			] }],
			"container-named": [Dd],
			columns: [{ columns: [
				Z,
				Q,
				$,
				s
			] }],
			"break-after": [{ "break-after": y() }],
			"break-before": [{ "break-before": y() }],
			"break-inside": [{ "break-inside": [
				"auto",
				"avoid",
				"avoid-page",
				"avoid-column"
			] }],
			"box-decoration": [{ "box-decoration": ["slice", "clone"] }],
			box: [{ box: ["border", "content"] }],
			display: [
				"block",
				"inline-block",
				"inline",
				"flex",
				"inline-flex",
				"table",
				"inline-table",
				"table-caption",
				"table-cell",
				"table-column",
				"table-column-group",
				"table-footer-group",
				"table-header-group",
				"table-row-group",
				"table-row",
				"flow-root",
				"grid",
				"inline-grid",
				"contents",
				"list-item",
				"hidden"
			],
			sr: ["sr-only", "not-sr-only"],
			float: [{ float: [
				"right",
				"left",
				"none",
				"start",
				"end"
			] }],
			clear: [{ clear: [
				"left",
				"right",
				"both",
				"none",
				"start",
				"end"
			] }],
			isolation: ["isolate", "isolation-auto"],
			"object-fit": [{ object: [
				"contain",
				"cover",
				"fill",
				"none",
				"scale-down"
			] }],
			"object-position": [{ object: x() }],
			overflow: [{ overflow: S() }],
			"overflow-x": [{ "overflow-x": S() }],
			"overflow-y": [{ "overflow-y": S() }],
			overscroll: [{ overscroll: C() }],
			"overscroll-x": [{ "overscroll-x": C() }],
			"overscroll-y": [{ "overscroll-y": C() }],
			position: [
				"static",
				"fixed",
				"absolute",
				"relative",
				"sticky"
			],
			inset: [{ inset: T() }],
			"inset-x": [{ "inset-x": T() }],
			"inset-y": [{ "inset-y": T() }],
			start: [{
				"inset-s": T(),
				start: T()
			}],
			end: [{
				"inset-e": T(),
				end: T()
			}],
			"inset-bs": [{ "inset-bs": T() }],
			"inset-be": [{ "inset-be": T() }],
			top: [{ top: T() }],
			right: [{ right: T() }],
			bottom: [{ bottom: T() }],
			left: [{ left: T() }],
			visibility: [
				"visible",
				"invisible",
				"collapse"
			],
			z: [{ z: [
				vd,
				"auto",
				$,
				Q
			] }],
			basis: [{ basis: [
				_d,
				"full",
				"auto",
				s,
				...w()
			] }],
			"flex-direction": [{ flex: [
				"row",
				"row-reverse",
				"col",
				"col-reverse"
			] }],
			"flex-wrap": [{ flex: [
				"nowrap",
				"wrap",
				"wrap-reverse"
			] }],
			flex: [{ flex: [
				Z,
				_d,
				"auto",
				"initial",
				"none",
				Q
			] }],
			grow: [{ grow: [
				"",
				Z,
				$,
				Q
			] }],
			shrink: [{ shrink: [
				"",
				Z,
				$,
				Q
			] }],
			order: [{ order: [
				vd,
				"first",
				"last",
				"none",
				$,
				Q
			] }],
			"grid-cols": [{ "grid-cols": ee() }],
			"col-start-end": [{ col: E() }],
			"col-start": [{ "col-start": D() }],
			"col-end": [{ "col-end": D() }],
			"grid-rows": [{ "grid-rows": ee() }],
			"row-start-end": [{ row: E() }],
			"row-start": [{ "row-start": D() }],
			"row-end": [{ "row-end": D() }],
			"grid-flow": [{ "grid-flow": [
				"row",
				"col",
				"dense",
				"row-dense",
				"col-dense"
			] }],
			"auto-cols": [{ "auto-cols": te() }],
			"auto-rows": [{ "auto-rows": te() }],
			gap: [{ gap: w() }],
			"gap-x": [{ "gap-x": w() }],
			"gap-y": [{ "gap-y": w() }],
			"justify-content": [{ justify: [...ne(), "normal"] }],
			"justify-items": [{ "justify-items": [...re(), "normal"] }],
			"justify-self": [{ "justify-self": ["auto", ...re()] }],
			"align-content": [{ content: ["normal", ...ne()] }],
			"align-items": [{ items: [...re(), { baseline: ["", "last"] }] }],
			"align-self": [{ self: [
				"auto",
				...re(),
				{ baseline: ["", "last"] }
			] }],
			"place-content": [{ "place-content": ne() }],
			"place-items": [{ "place-items": [...re(), "baseline"] }],
			"place-self": [{ "place-self": ["auto", ...re()] }],
			p: [{ p: w() }],
			px: [{ px: w() }],
			py: [{ py: w() }],
			ps: [{ ps: w() }],
			pe: [{ pe: w() }],
			pbs: [{ pbs: w() }],
			pbe: [{ pbe: w() }],
			pt: [{ pt: w() }],
			pr: [{ pr: w() }],
			pb: [{ pb: w() }],
			pl: [{ pl: w() }],
			m: [{ m: ie() }],
			mx: [{ mx: ie() }],
			my: [{ my: ie() }],
			ms: [{ ms: ie() }],
			me: [{ me: ie() }],
			mbs: [{ mbs: ie() }],
			mbe: [{ mbe: ie() }],
			mt: [{ mt: ie() }],
			mr: [{ mr: ie() }],
			mb: [{ mb: ie() }],
			ml: [{ ml: ie() }],
			"space-x": [{ "space-x": w() }],
			"space-x-reverse": ["space-x-reverse"],
			"space-y": [{ "space-y": w() }],
			"space-y-reverse": ["space-y-reverse"],
			size: [{ size: O() }],
			"inline-size": [{ inline: ["auto", ...ae()] }],
			"min-inline-size": [{ "min-inline": ["auto", ...ae()] }],
			"max-inline-size": [{ "max-inline": ["none", ...ae()] }],
			"block-size": [{ block: ["auto", ...oe()] }],
			"min-block-size": [{ "min-block": ["auto", ...oe()] }],
			"max-block-size": [{ "max-block": ["none", ...oe()] }],
			w: [{ w: [
				s,
				"screen",
				...O()
			] }],
			"min-w": [{ "min-w": [
				s,
				"screen",
				"none",
				...O()
			] }],
			"max-w": [{ "max-w": [
				s,
				"screen",
				"none",
				"prose",
				{ screen: [o] },
				...O()
			] }],
			h: [{ h: [
				"screen",
				"lh",
				...O()
			] }],
			"min-h": [{ "min-h": [
				"screen",
				"lh",
				"none",
				...O()
			] }],
			"max-h": [{ "max-h": [
				"screen",
				"lh",
				...O()
			] }],
			"font-size": [{ text: [
				"base",
				n,
				Id,
				kd
			] }],
			"font-smoothing": ["antialiased", "subpixel-antialiased"],
			"font-style": ["italic", "not-italic"],
			"font-weight": [{ font: [
				r,
				Hd,
				jd
			] }],
			"font-stretch": [{ "font-stretch": [
				"ultra-condensed",
				"extra-condensed",
				"condensed",
				"semi-condensed",
				"normal",
				"semi-expanded",
				"expanded",
				"extra-expanded",
				"ultra-expanded",
				yd,
				Q
			] }],
			"font-family": [{ font: [
				Ld,
				Md,
				t
			] }],
			"font-features": [{ "font-features": [Q] }],
			"fvn-normal": ["normal-nums"],
			"fvn-ordinal": ["ordinal"],
			"fvn-slashed-zero": ["slashed-zero"],
			"fvn-figure": ["lining-nums", "oldstyle-nums"],
			"fvn-spacing": ["proportional-nums", "tabular-nums"],
			"fvn-fraction": ["diagonal-fractions", "stacked-fractions"],
			tracking: [{ tracking: [
				i,
				$,
				Q
			] }],
			"line-clamp": [{ "line-clamp": [
				Z,
				"none",
				$,
				Ad
			] }],
			leading: [{ leading: [a, ...w()] }],
			"list-image": [{ "list-image": [
				"none",
				$,
				Q
			] }],
			"list-style-position": [{ list: ["inside", "outside"] }],
			"list-style-type": [{ list: [
				"disc",
				"decimal",
				"none",
				$,
				Q
			] }],
			"text-alignment": [{ text: [
				"left",
				"center",
				"right",
				"justify",
				"start",
				"end"
			] }],
			"placeholder-color": [{ placeholder: k() }],
			"text-color": [{ text: k() }],
			"text-decoration": [
				"underline",
				"overline",
				"line-through",
				"no-underline"
			],
			"text-decoration-style": [{ decoration: [...pe(), "wavy"] }],
			"text-decoration-thickness": [{ decoration: [
				Z,
				"from-font",
				"auto",
				$,
				kd
			] }],
			"text-decoration-color": [{ decoration: k() }],
			"underline-offset": [{ "underline-offset": [
				Z,
				"auto",
				$,
				Q
			] }],
			"text-transform": [
				"uppercase",
				"lowercase",
				"capitalize",
				"normal-case"
			],
			"text-overflow": [
				"truncate",
				"text-ellipsis",
				"text-clip"
			],
			"text-wrap": [{ text: [
				"wrap",
				"nowrap",
				"balance",
				"pretty"
			] }],
			indent: [{ indent: w() }],
			"tab-size": [{ tab: [
				vd,
				$,
				Q
			] }],
			"vertical-align": [{ align: [
				"baseline",
				"top",
				"middle",
				"bottom",
				"text-top",
				"text-bottom",
				"sub",
				"super",
				$,
				Q
			] }],
			whitespace: [{ whitespace: [
				"normal",
				"nowrap",
				"pre",
				"pre-line",
				"pre-wrap",
				"break-spaces"
			] }],
			break: [{ break: [
				"normal",
				"words",
				"all",
				"keep"
			] }],
			wrap: [{ wrap: [
				"break-word",
				"anywhere",
				"normal"
			] }],
			hyphens: [{ hyphens: [
				"none",
				"manual",
				"auto"
			] }],
			content: [{ content: [
				"none",
				$,
				Q
			] }],
			"bg-attachment": [{ bg: [
				"fixed",
				"local",
				"scroll"
			] }],
			"bg-clip": [{ "bg-clip": [
				"border",
				"padding",
				"content",
				"text"
			] }],
			"bg-origin": [{ "bg-origin": [
				"border",
				"padding",
				"content"
			] }],
			"bg-position": [{ bg: se() }],
			"bg-repeat": [{ bg: ce() }],
			"bg-size": [{ bg: le() }],
			"bg-image": [{ bg: [
				"none",
				{
					linear: [
						{ to: [
							"t",
							"tr",
							"r",
							"br",
							"b",
							"bl",
							"l",
							"tl"
						] },
						vd,
						$,
						Q
					],
					radial: [
						"",
						$,
						Q
					],
					conic: [
						vd,
						$,
						Q
					]
				},
				Bd,
				Pd
			] }],
			"bg-color": [{ bg: k() }],
			"gradient-from-pos": [{ from: ue() }],
			"gradient-via-pos": [{ via: ue() }],
			"gradient-to-pos": [{ to: ue() }],
			"gradient-from": [{ from: k() }],
			"gradient-via": [{ via: k() }],
			"gradient-to": [{ to: k() }],
			rounded: [{ rounded: de() }],
			"rounded-s": [{ "rounded-s": de() }],
			"rounded-e": [{ "rounded-e": de() }],
			"rounded-t": [{ "rounded-t": de() }],
			"rounded-r": [{ "rounded-r": de() }],
			"rounded-b": [{ "rounded-b": de() }],
			"rounded-l": [{ "rounded-l": de() }],
			"rounded-ss": [{ "rounded-ss": de() }],
			"rounded-se": [{ "rounded-se": de() }],
			"rounded-ee": [{ "rounded-ee": de() }],
			"rounded-es": [{ "rounded-es": de() }],
			"rounded-tl": [{ "rounded-tl": de() }],
			"rounded-tr": [{ "rounded-tr": de() }],
			"rounded-br": [{ "rounded-br": de() }],
			"rounded-bl": [{ "rounded-bl": de() }],
			"border-w": [{ border: fe() }],
			"border-w-x": [{ "border-x": fe() }],
			"border-w-y": [{ "border-y": fe() }],
			"border-w-s": [{ "border-s": fe() }],
			"border-w-e": [{ "border-e": fe() }],
			"border-w-bs": [{ "border-bs": fe() }],
			"border-w-be": [{ "border-be": fe() }],
			"border-w-t": [{ "border-t": fe() }],
			"border-w-r": [{ "border-r": fe() }],
			"border-w-b": [{ "border-b": fe() }],
			"border-w-l": [{ "border-l": fe() }],
			"divide-x": [{ "divide-x": fe() }],
			"divide-x-reverse": ["divide-x-reverse"],
			"divide-y": [{ "divide-y": fe() }],
			"divide-y-reverse": ["divide-y-reverse"],
			"border-style": [{ border: [
				...pe(),
				"hidden",
				"none"
			] }],
			"divide-style": [{ divide: [
				...pe(),
				"hidden",
				"none"
			] }],
			"border-color": [{ border: k() }],
			"border-color-x": [{ "border-x": k() }],
			"border-color-y": [{ "border-y": k() }],
			"border-color-s": [{ "border-s": k() }],
			"border-color-e": [{ "border-e": k() }],
			"border-color-bs": [{ "border-bs": k() }],
			"border-color-be": [{ "border-be": k() }],
			"border-color-t": [{ "border-t": k() }],
			"border-color-r": [{ "border-r": k() }],
			"border-color-b": [{ "border-b": k() }],
			"border-color-l": [{ "border-l": k() }],
			"divide-color": [{ divide: k() }],
			"outline-style": [{ outline: [
				...pe(),
				"none",
				"hidden"
			] }],
			"outline-offset": [{ "outline-offset": [
				Z,
				$,
				Q
			] }],
			"outline-w": [{ outline: [
				"",
				Z,
				Id,
				kd
			] }],
			"outline-color": [{ outline: k() }],
			shadow: [{ shadow: [
				"",
				"none",
				u,
				Vd,
				Fd
			] }],
			"shadow-color": [{ shadow: k() }],
			"inset-shadow": [{ "inset-shadow": [
				"none",
				d,
				Vd,
				Fd
			] }],
			"inset-shadow-color": [{ "inset-shadow": k() }],
			"ring-w": [{ ring: fe() }],
			"ring-w-inset": ["ring-inset"],
			"ring-color": [{ ring: k() }],
			"ring-offset-w": [{ "ring-offset": [Z, kd] }],
			"ring-offset-color": [{ "ring-offset": k() }],
			"inset-ring-w": [{ "inset-ring": fe() }],
			"inset-ring-color": [{ "inset-ring": k() }],
			"text-shadow": [{ "text-shadow": [
				"none",
				f,
				Vd,
				Fd
			] }],
			"text-shadow-color": [{ "text-shadow": k() }],
			opacity: [{ opacity: [
				Z,
				$,
				Q
			] }],
			"mix-blend": [{ "mix-blend": [
				...A(),
				"plus-darker",
				"plus-lighter"
			] }],
			"bg-blend": [{ "bg-blend": A() }],
			"mask-clip": [{ "mask-clip": [
				"border",
				"padding",
				"content",
				"fill",
				"stroke",
				"view"
			] }, "mask-no-clip"],
			"mask-composite": [{ mask: [
				"add",
				"subtract",
				"intersect",
				"exclude"
			] }],
			"mask-image-linear-pos": [{ "mask-linear": [Z] }],
			"mask-image-linear-from-pos": [{ "mask-linear-from": j() }],
			"mask-image-linear-to-pos": [{ "mask-linear-to": j() }],
			"mask-image-linear-from-color": [{ "mask-linear-from": k() }],
			"mask-image-linear-to-color": [{ "mask-linear-to": k() }],
			"mask-image-t-from-pos": [{ "mask-t-from": j() }],
			"mask-image-t-to-pos": [{ "mask-t-to": j() }],
			"mask-image-t-from-color": [{ "mask-t-from": k() }],
			"mask-image-t-to-color": [{ "mask-t-to": k() }],
			"mask-image-r-from-pos": [{ "mask-r-from": j() }],
			"mask-image-r-to-pos": [{ "mask-r-to": j() }],
			"mask-image-r-from-color": [{ "mask-r-from": k() }],
			"mask-image-r-to-color": [{ "mask-r-to": k() }],
			"mask-image-b-from-pos": [{ "mask-b-from": j() }],
			"mask-image-b-to-pos": [{ "mask-b-to": j() }],
			"mask-image-b-from-color": [{ "mask-b-from": k() }],
			"mask-image-b-to-color": [{ "mask-b-to": k() }],
			"mask-image-l-from-pos": [{ "mask-l-from": j() }],
			"mask-image-l-to-pos": [{ "mask-l-to": j() }],
			"mask-image-l-from-color": [{ "mask-l-from": k() }],
			"mask-image-l-to-color": [{ "mask-l-to": k() }],
			"mask-image-x-from-pos": [{ "mask-x-from": j() }],
			"mask-image-x-to-pos": [{ "mask-x-to": j() }],
			"mask-image-x-from-color": [{ "mask-x-from": k() }],
			"mask-image-x-to-color": [{ "mask-x-to": k() }],
			"mask-image-y-from-pos": [{ "mask-y-from": j() }],
			"mask-image-y-to-pos": [{ "mask-y-to": j() }],
			"mask-image-y-from-color": [{ "mask-y-from": k() }],
			"mask-image-y-to-color": [{ "mask-y-to": k() }],
			"mask-image-radial": [{ "mask-radial": [$, Q] }],
			"mask-image-radial-from-pos": [{ "mask-radial-from": j() }],
			"mask-image-radial-to-pos": [{ "mask-radial-to": j() }],
			"mask-image-radial-from-color": [{ "mask-radial-from": k() }],
			"mask-image-radial-to-color": [{ "mask-radial-to": k() }],
			"mask-image-radial-shape": [{ "mask-radial": ["circle", "ellipse"] }],
			"mask-image-radial-size": [{ "mask-radial": [{
				closest: ["side", "corner"],
				farthest: ["side", "corner"]
			}] }],
			"mask-image-radial-pos": [{ "mask-radial-at": b() }],
			"mask-image-conic-pos": [{ "mask-conic": [Z] }],
			"mask-image-conic-from-pos": [{ "mask-conic-from": j() }],
			"mask-image-conic-to-pos": [{ "mask-conic-to": j() }],
			"mask-image-conic-from-color": [{ "mask-conic-from": k() }],
			"mask-image-conic-to-color": [{ "mask-conic-to": k() }],
			"mask-mode": [{ mask: [
				"alpha",
				"luminance",
				"match"
			] }],
			"mask-origin": [{ "mask-origin": [
				"border",
				"padding",
				"content",
				"fill",
				"stroke",
				"view"
			] }],
			"mask-position": [{ mask: se() }],
			"mask-repeat": [{ mask: ce() }],
			"mask-size": [{ mask: le() }],
			"mask-type": [{ "mask-type": ["alpha", "luminance"] }],
			"mask-image": [{ mask: [
				"none",
				$,
				Q
			] }],
			filter: [{ filter: [
				"",
				"none",
				$,
				Q
			] }],
			blur: [{ blur: me() }],
			brightness: [{ brightness: [
				Z,
				$,
				Q
			] }],
			contrast: [{ contrast: [
				Z,
				$,
				Q
			] }],
			"drop-shadow": [{ "drop-shadow": [
				"",
				"none",
				p,
				Vd,
				Fd
			] }],
			"drop-shadow-color": [{ "drop-shadow": k() }],
			grayscale: [{ grayscale: [
				"",
				Z,
				$,
				Q
			] }],
			"hue-rotate": [{ "hue-rotate": [
				Z,
				$,
				Q
			] }],
			invert: [{ invert: [
				"",
				Z,
				$,
				Q
			] }],
			saturate: [{ saturate: [
				Z,
				$,
				Q
			] }],
			sepia: [{ sepia: [
				"",
				Z,
				$,
				Q
			] }],
			"backdrop-filter": [{ "backdrop-filter": [
				"",
				"none",
				$,
				Q
			] }],
			"backdrop-blur": [{ "backdrop-blur": me() }],
			"backdrop-brightness": [{ "backdrop-brightness": [
				Z,
				$,
				Q
			] }],
			"backdrop-contrast": [{ "backdrop-contrast": [
				Z,
				$,
				Q
			] }],
			"backdrop-grayscale": [{ "backdrop-grayscale": [
				"",
				Z,
				$,
				Q
			] }],
			"backdrop-hue-rotate": [{ "backdrop-hue-rotate": [
				Z,
				$,
				Q
			] }],
			"backdrop-invert": [{ "backdrop-invert": [
				"",
				Z,
				$,
				Q
			] }],
			"backdrop-opacity": [{ "backdrop-opacity": [
				Z,
				$,
				Q
			] }],
			"backdrop-saturate": [{ "backdrop-saturate": [
				Z,
				$,
				Q
			] }],
			"backdrop-sepia": [{ "backdrop-sepia": [
				"",
				Z,
				$,
				Q
			] }],
			"border-collapse": [{ border: ["collapse", "separate"] }],
			"border-spacing": [{ "border-spacing": w() }],
			"border-spacing-x": [{ "border-spacing-x": w() }],
			"border-spacing-y": [{ "border-spacing-y": w() }],
			"table-layout": [{ table: ["auto", "fixed"] }],
			caption: [{ caption: ["top", "bottom"] }],
			transition: [{ transition: [
				"",
				"all",
				"colors",
				"opacity",
				"shadow",
				"transform",
				"none",
				$,
				Q
			] }],
			"transition-behavior": [{ transition: ["normal", "discrete"] }],
			duration: [{ duration: [
				Z,
				"initial",
				$,
				Q
			] }],
			ease: [{ ease: [
				"linear",
				"initial",
				_,
				$,
				Q
			] }],
			delay: [{ delay: [
				Z,
				$,
				Q
			] }],
			animate: [{ animate: [
				"none",
				v,
				$,
				Q
			] }],
			backface: [{ backface: ["hidden", "visible"] }],
			perspective: [{ perspective: [
				h,
				$,
				Q
			] }],
			"perspective-origin": [{ "perspective-origin": x() }],
			rotate: [{ rotate: he() }],
			"rotate-x": [{ "rotate-x": he() }],
			"rotate-y": [{ "rotate-y": he() }],
			"rotate-z": [{ "rotate-z": he() }],
			scale: [{ scale: ge() }],
			"scale-x": [{ "scale-x": ge() }],
			"scale-y": [{ "scale-y": ge() }],
			"scale-z": [{ "scale-z": ge() }],
			"scale-3d": ["scale-3d"],
			skew: [{ skew: _e() }],
			"skew-x": [{ "skew-x": _e() }],
			"skew-y": [{ "skew-y": _e() }],
			transform: [{ transform: [
				$,
				Q,
				"",
				"none",
				"gpu",
				"cpu"
			] }],
			"transform-origin": [{ origin: x() }],
			"transform-style": [{ transform: ["3d", "flat"] }],
			translate: [{ translate: ve() }],
			"translate-x": [{ "translate-x": ve() }],
			"translate-y": [{ "translate-y": ve() }],
			"translate-z": [{ "translate-z": ve() }],
			"translate-none": ["translate-none"],
			zoom: [{ zoom: [
				vd,
				$,
				Q
			] }],
			accent: [{ accent: k() }],
			appearance: [{ appearance: ["none", "auto"] }],
			"caret-color": [{ caret: k() }],
			"color-scheme": [{ scheme: [
				"normal",
				"dark",
				"light",
				"light-dark",
				"only-dark",
				"only-light"
			] }],
			cursor: [{ cursor: [
				"auto",
				"default",
				"pointer",
				"wait",
				"text",
				"move",
				"help",
				"not-allowed",
				"none",
				"context-menu",
				"progress",
				"cell",
				"crosshair",
				"vertical-text",
				"alias",
				"copy",
				"no-drop",
				"grab",
				"grabbing",
				"all-scroll",
				"col-resize",
				"row-resize",
				"n-resize",
				"e-resize",
				"s-resize",
				"w-resize",
				"ne-resize",
				"nw-resize",
				"se-resize",
				"sw-resize",
				"ew-resize",
				"ns-resize",
				"nesw-resize",
				"nwse-resize",
				"zoom-in",
				"zoom-out",
				$,
				Q
			] }],
			"field-sizing": [{ "field-sizing": ["fixed", "content"] }],
			"pointer-events": [{ "pointer-events": ["auto", "none"] }],
			resize: [{ resize: [
				"none",
				"",
				"y",
				"x"
			] }],
			"scroll-behavior": [{ scroll: ["auto", "smooth"] }],
			"scrollbar-thumb-color": [{ "scrollbar-thumb": k() }],
			"scrollbar-track-color": [{ "scrollbar-track": k() }],
			"scrollbar-gutter": [{ "scrollbar-gutter": [
				"auto",
				"stable",
				"both"
			] }],
			"scrollbar-w": [{ scrollbar: [
				"auto",
				"thin",
				"none"
			] }],
			"scroll-m": [{ "scroll-m": w() }],
			"scroll-mx": [{ "scroll-mx": w() }],
			"scroll-my": [{ "scroll-my": w() }],
			"scroll-ms": [{ "scroll-ms": w() }],
			"scroll-me": [{ "scroll-me": w() }],
			"scroll-mbs": [{ "scroll-mbs": w() }],
			"scroll-mbe": [{ "scroll-mbe": w() }],
			"scroll-mt": [{ "scroll-mt": w() }],
			"scroll-mr": [{ "scroll-mr": w() }],
			"scroll-mb": [{ "scroll-mb": w() }],
			"scroll-ml": [{ "scroll-ml": w() }],
			"scroll-p": [{ "scroll-p": w() }],
			"scroll-px": [{ "scroll-px": w() }],
			"scroll-py": [{ "scroll-py": w() }],
			"scroll-ps": [{ "scroll-ps": w() }],
			"scroll-pe": [{ "scroll-pe": w() }],
			"scroll-pbs": [{ "scroll-pbs": w() }],
			"scroll-pbe": [{ "scroll-pbe": w() }],
			"scroll-pt": [{ "scroll-pt": w() }],
			"scroll-pr": [{ "scroll-pr": w() }],
			"scroll-pb": [{ "scroll-pb": w() }],
			"scroll-pl": [{ "scroll-pl": w() }],
			"snap-align": [{ snap: [
				"start",
				"end",
				"center",
				"align-none"
			] }],
			"snap-stop": [{ snap: ["normal", "always"] }],
			"snap-type": [{ snap: [
				"none",
				"x",
				"y",
				"both"
			] }],
			"snap-strictness": [{ snap: ["mandatory", "proximity"] }],
			touch: [{ touch: [
				"auto",
				"none",
				"manipulation"
			] }],
			"touch-x": [{ "touch-pan": [
				"x",
				"left",
				"right"
			] }],
			"touch-y": [{ "touch-pan": [
				"y",
				"up",
				"down"
			] }],
			"touch-pz": ["touch-pinch-zoom"],
			select: [{ select: [
				"none",
				"text",
				"all",
				"auto"
			] }],
			"will-change": [{ "will-change": [
				"auto",
				"scroll",
				"contents",
				"transform",
				$,
				Q
			] }],
			fill: [{ fill: ["none", ...k()] }],
			"stroke-w": [{ stroke: [
				Z,
				Id,
				kd,
				Ad
			] }],
			stroke: [{ stroke: ["none", ...k()] }],
			"forced-color-adjust": [{ "forced-color-adjust": ["auto", "none"] }]
		},
		conflictingClassGroups: {
			"container-named": ["container-type"],
			overflow: ["overflow-x", "overflow-y"],
			overscroll: ["overscroll-x", "overscroll-y"],
			inset: [
				"inset-x",
				"inset-y",
				"inset-bs",
				"inset-be",
				"start",
				"end",
				"top",
				"right",
				"bottom",
				"left"
			],
			"inset-x": ["right", "left"],
			"inset-y": ["top", "bottom"],
			flex: [
				"basis",
				"grow",
				"shrink"
			],
			gap: ["gap-x", "gap-y"],
			p: [
				"px",
				"py",
				"ps",
				"pe",
				"pbs",
				"pbe",
				"pt",
				"pr",
				"pb",
				"pl"
			],
			px: ["pr", "pl"],
			py: ["pt", "pb"],
			m: [
				"mx",
				"my",
				"ms",
				"me",
				"mbs",
				"mbe",
				"mt",
				"mr",
				"mb",
				"ml"
			],
			mx: ["mr", "ml"],
			my: ["mt", "mb"],
			size: ["w", "h"],
			"font-size": ["leading"],
			"fvn-normal": [
				"fvn-ordinal",
				"fvn-slashed-zero",
				"fvn-figure",
				"fvn-spacing",
				"fvn-fraction"
			],
			"fvn-ordinal": ["fvn-normal"],
			"fvn-slashed-zero": ["fvn-normal"],
			"fvn-figure": ["fvn-normal"],
			"fvn-spacing": ["fvn-normal"],
			"fvn-fraction": ["fvn-normal"],
			"line-clamp": ["display", "overflow"],
			rounded: [
				"rounded-s",
				"rounded-e",
				"rounded-t",
				"rounded-r",
				"rounded-b",
				"rounded-l",
				"rounded-ss",
				"rounded-se",
				"rounded-ee",
				"rounded-es",
				"rounded-tl",
				"rounded-tr",
				"rounded-br",
				"rounded-bl"
			],
			"rounded-s": ["rounded-ss", "rounded-es"],
			"rounded-e": ["rounded-se", "rounded-ee"],
			"rounded-t": ["rounded-tl", "rounded-tr"],
			"rounded-r": ["rounded-tr", "rounded-br"],
			"rounded-b": ["rounded-br", "rounded-bl"],
			"rounded-l": ["rounded-tl", "rounded-bl"],
			"border-spacing": ["border-spacing-x", "border-spacing-y"],
			"border-w": [
				"border-w-x",
				"border-w-y",
				"border-w-s",
				"border-w-e",
				"border-w-bs",
				"border-w-be",
				"border-w-t",
				"border-w-r",
				"border-w-b",
				"border-w-l"
			],
			"border-w-x": ["border-w-r", "border-w-l"],
			"border-w-y": ["border-w-t", "border-w-b"],
			"border-color": [
				"border-color-x",
				"border-color-y",
				"border-color-s",
				"border-color-e",
				"border-color-bs",
				"border-color-be",
				"border-color-t",
				"border-color-r",
				"border-color-b",
				"border-color-l"
			],
			"border-color-x": ["border-color-r", "border-color-l"],
			"border-color-y": ["border-color-t", "border-color-b"],
			translate: [
				"translate-x",
				"translate-y",
				"translate-none"
			],
			"translate-none": [
				"translate",
				"translate-x",
				"translate-y",
				"translate-z"
			],
			"scroll-m": [
				"scroll-mx",
				"scroll-my",
				"scroll-ms",
				"scroll-me",
				"scroll-mbs",
				"scroll-mbe",
				"scroll-mt",
				"scroll-mr",
				"scroll-mb",
				"scroll-ml"
			],
			"scroll-mx": ["scroll-mr", "scroll-ml"],
			"scroll-my": ["scroll-mt", "scroll-mb"],
			"scroll-p": [
				"scroll-px",
				"scroll-py",
				"scroll-ps",
				"scroll-pe",
				"scroll-pbs",
				"scroll-pbe",
				"scroll-pt",
				"scroll-pr",
				"scroll-pb",
				"scroll-pl"
			],
			"scroll-px": ["scroll-pr", "scroll-pl"],
			"scroll-py": ["scroll-pt", "scroll-pb"],
			touch: [
				"touch-x",
				"touch-y",
				"touch-pz"
			],
			"touch-x": ["touch"],
			"touch-y": ["touch"],
			"touch-pz": ["touch"]
		},
		conflictingClassGroupModifiers: { "font-size": ["leading"] },
		postfixLookupClassGroups: ["container-type"],
		orderSensitiveModifiers: [
			"*",
			"**",
			"after",
			"backdrop",
			"before",
			"details-content",
			"file",
			"first-letter",
			"first-line",
			"marker",
			"placeholder",
			"selection"
		]
	};
}, ef = (e, { cacheSize: t, prefix: n, experimentalParseClassName: r, extend: i = {}, override: a = {} }) => (tf(e, "cacheSize", t), tf(e, "prefix", n), tf(e, "experimentalParseClassName", r), nf(e.theme, a.theme), nf(e.classGroups, a.classGroups), nf(e.conflictingClassGroups, a.conflictingClassGroups), nf(e.conflictingClassGroupModifiers, a.conflictingClassGroupModifiers), tf(e, "postfixLookupClassGroups", a.postfixLookupClassGroups), tf(e, "orderSensitiveModifiers", a.orderSensitiveModifiers), rf(e.theme, i.theme), rf(e.classGroups, i.classGroups), rf(e.conflictingClassGroups, i.conflictingClassGroups), rf(e.conflictingClassGroupModifiers, i.conflictingClassGroupModifiers), af(e, i, "postfixLookupClassGroups"), af(e, i, "orderSensitiveModifiers"), e), tf = (e, t, n) => {
	n !== void 0 && (e[t] = n);
}, nf = (e, t) => {
	if (t) for (let n in t) tf(e, n, t[n]);
}, rf = (e, t) => {
	if (t) for (let n in t) af(e, t, n);
}, af = (e, t, n) => {
	let r = t[n];
	r !== void 0 && (e[n] = e[n] ? e[n].concat(r) : r);
}, of = (e, ...t) => typeof e == "function" ? od($d, e, ...t) : od(() => ef($d(), e), ...t), sf = /*#__PURE__*/ od($d), cf = (e) => yu(e) ? sf : of({
	...e,
	extend: {
		theme: e.theme,
		classGroups: e.classGroups,
		conflictingClassGroupModifiers: e.conflictingClassGroupModifiers,
		conflictingClassGroups: e.conflictingClassGroups,
		...e.extend
	}
}), lf = (e, t) => {
	let n = _u(e);
	return !n || !(t?.twMerge ?? !0) ? n : ((!Du.cachedTwMerge || Du.didTwMergeConfigChange) && (Du.didTwMergeConfigChange = !1, Du.cachedTwMerge = cf(Du.cachedTwMergeConfig)), Du.cachedTwMerge(n) || void 0);
}, uf = (...e) => (t) => lf(e, t), { createTV: df, tv: ff } = Ou(uf), pf = zs.ui?.tv, mf = /* @__PURE__ */ df(pf);
function hf(e) {
	if (typeof e == "function") return e;
	if (Array.isArray(e)) for (let t = e.length - 1; t >= 0; t--) {
		let n = hf(e[t]);
		if (n) return n;
	}
}
function gf(e) {
	return Array.isArray(e) ? e.flatMap((e) => gf(e)) : typeof e == "function" ? [] : [e];
}
function _f(e, t, n) {
	return uf(e(n()), ...gf(t.class), ...gf(t.className))(pf) ?? "";
}
function vf(e, t) {
	return new Proxy(e, { get(e, n) {
		let r = e[n];
		return typeof r == "function" ? (e = {}) => {
			let i = hf(e.class) ?? hf(e.className) ?? t?.[n];
			return i ? _f(i, e, () => r({
				...e,
				class: void 0,
				className: void 0
			})) : r(e);
		} : r;
	} });
}
function yf(e) {
	if (!e || typeof e != "object") return { config: e };
	let t = e, n;
	typeof e.base == "function" && (n = { base: e.base }, t = {
		...t,
		base: ""
	});
	let r = e.slots;
	if (r && typeof r == "object") {
		let e = Object.entries(r).filter(([, e]) => typeof e == "function");
		if (e.length) {
			n ??= {};
			let i = { ...r };
			for (let [t, r] of e) n[t] = r, i[t] = "";
			t = {
				...t,
				slots: i
			};
		}
	}
	return {
		config: t,
		directives: n
	};
}
var bf = ((e) => {
	let { config: t, directives: n } = yf(e), r = mf(t);
	return new Proxy(r, { apply(e, t, r) {
		let i = Reflect.apply(e, t, r);
		if (i && typeof i == "object") return vf(i, n);
		if (typeof i == "string") {
			let i = r[0] ?? {}, a = hf(i.class) ?? hf(i.className) ?? n?.base;
			if (a) return _f(a, i, () => Reflect.apply(e, t, [{
				...i,
				class: void 0,
				className: void 0
			}]));
		}
		return i;
	} });
}), xf = /* @__PURE__ */ "active.activeClass.ariaCurrentValue.as.disabled.download.exact.exactActiveClass.exactHash.exactQuery.external.form.formaction.formenctype.formmethod.formnovalidate.formtarget.href.hreflang.inactiveClass.locale.media.noPrefetch.noRel.onClick.ping.prefetch.prefetchOn.prefetchedClass.referrerpolicy.rel.replace.target.title.to.trailingSlash.type.viewTransition".split(".");
function Sf(e) {
	let t = Object.keys(e), n = t.filter((e) => e.startsWith("aria-")), r = t.filter((e) => e.startsWith("data-"));
	return Ts(e, ...xf, ...n, ...r);
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/@iconify+vue@5.0.1_vue@3.5.41_typescript@5.9.3_/node_modules/@iconify/vue/dist/iconify.mjs
var Cf = /^[a-z0-9]+(-[a-z0-9]+)*$/, wf = (e, t, n, r = "") => {
	let i = e.split(":");
	if (e.slice(0, 1) === "@") {
		if (i.length < 2 || i.length > 3) return null;
		r = i.shift().slice(1);
	}
	if (i.length > 3 || !i.length) return null;
	if (i.length > 1) {
		let e = i.pop(), n = i.pop(), a = {
			provider: i.length > 0 ? i[0] : r,
			prefix: n,
			name: e
		};
		return t && !Tf(a) ? null : a;
	}
	let a = i[0], o = a.split("-");
	if (o.length > 1) {
		let e = {
			provider: r,
			prefix: o.shift(),
			name: o.join("-")
		};
		return t && !Tf(e) ? null : e;
	}
	if (n && r === "") {
		let e = {
			provider: r,
			prefix: "",
			name: a
		};
		return t && !Tf(e, n) ? null : e;
	}
	return null;
}, Tf = (e, t) => e ? !!((t && e.prefix === "" || e.prefix) && e.name) : !1;
function Ef(e, t) {
	let n = e.icons, r = e.aliases || Object.create(null), i = Object.create(null);
	function a(e) {
		if (n[e]) return i[e] = [];
		if (!(e in i)) {
			i[e] = null;
			let t = r[e] && r[e].parent, n = t && a(t);
			n && (i[e] = [t].concat(n));
		}
		return i[e];
	}
	return Object.keys(n).concat(Object.keys(r)).forEach(a), i;
}
var Df = Object.freeze({
	left: 0,
	top: 0,
	width: 16,
	height: 16
}), Of = Object.freeze({
	rotate: 0,
	vFlip: !1,
	hFlip: !1
}), kf = Object.freeze({
	...Df,
	...Of
}), Af = Object.freeze({
	...kf,
	body: "",
	hidden: !1
});
function jf(e, t) {
	let n = {};
	!e.hFlip != !t.hFlip && (n.hFlip = !0), !e.vFlip != !t.vFlip && (n.vFlip = !0);
	let r = ((e.rotate || 0) + (t.rotate || 0)) % 4;
	return r && (n.rotate = r), n;
}
function Mf(e, t) {
	let n = jf(e, t);
	for (let r in Af) r in Of ? r in e && !(r in n) && (n[r] = Of[r]) : r in t ? n[r] = t[r] : r in e && (n[r] = e[r]);
	return n;
}
function Nf(e, t, n) {
	let r = e.icons, i = e.aliases || Object.create(null), a = {};
	function o(e) {
		a = Mf(r[e] || i[e], a);
	}
	return o(t), n.forEach(o), Mf(e, a);
}
function Pf(e, t) {
	let n = [];
	if (typeof e != "object" || typeof e.icons != "object") return n;
	e.not_found instanceof Array && e.not_found.forEach((e) => {
		t(e, null), n.push(e);
	});
	let r = Ef(e);
	for (let i in r) {
		let a = r[i];
		a && (t(i, Nf(e, i, a)), n.push(i));
	}
	return n;
}
var Ff = {
	provider: "",
	aliases: {},
	not_found: {},
	...Df
};
function If(e, t) {
	for (let n in t) if (n in e && typeof e[n] != typeof t[n]) return !1;
	return !0;
}
function Lf(e) {
	if (typeof e != "object" || !e) return null;
	let t = e;
	if (typeof t.prefix != "string" || !e.icons || typeof e.icons != "object" || !If(e, Ff)) return null;
	let n = t.icons;
	for (let e in n) {
		let t = n[e];
		if (!e || typeof t.body != "string" || !If(t, Af)) return null;
	}
	let r = t.aliases || Object.create(null);
	for (let e in r) {
		let t = r[e], i = t.parent;
		if (!e || typeof i != "string" || !n[i] && !r[i] || !If(t, Af)) return null;
	}
	return t;
}
var Rf = Object.create(null);
function zf(e, t) {
	return {
		provider: e,
		prefix: t,
		icons: Object.create(null),
		missing: /* @__PURE__ */ new Set()
	};
}
function Bf(e, t) {
	let n = Rf[e] || (Rf[e] = Object.create(null));
	return n[t] || (n[t] = zf(e, t));
}
function Vf(e, t) {
	return Lf(t) ? Pf(t, (t, n) => {
		n ? e.icons[t] = n : e.missing.add(t);
	}) : [];
}
function Hf(e, t, n) {
	try {
		if (typeof n.body == "string") return e.icons[t] = { ...n }, !0;
	} catch {}
	return !1;
}
var Uf = !1;
function Wf(e) {
	return typeof e == "boolean" && (Uf = e), Uf;
}
function Gf(e) {
	let t = typeof e == "string" ? wf(e, !0, Uf) : e;
	if (t) {
		let e = Bf(t.provider, t.prefix), n = t.name;
		return e.icons[n] || (e.missing.has(n) ? null : void 0);
	}
}
function Kf(e, t) {
	let n = wf(e, !0, Uf);
	if (!n) return !1;
	let r = Bf(n.provider, n.prefix);
	return t ? Hf(r, n.name, t) : (r.missing.add(n.name), !0);
}
function qf(e, t) {
	if (typeof e != "object") return !1;
	if (typeof t != "string" && (t = e.provider || ""), Uf && !t && !e.prefix) {
		let t = !1;
		return Lf(e) && (e.prefix = "", Pf(e, (e, n) => {
			Kf(e, n) && (t = !0);
		})), t;
	}
	let n = e.prefix;
	return Tf({
		prefix: n,
		name: "a"
	}) ? !!Vf(Bf(t, n), e) : !1;
}
var Jf = Object.freeze({
	width: null,
	height: null
}), Yf = Object.freeze({
	...Jf,
	...Of
}), Xf = /(-?[0-9.]*[0-9]+[0-9.]*)/g, Zf = /^-?[0-9.]*[0-9]+[0-9.]*$/g;
function Qf(e, t, n) {
	if (t === 1) return e;
	if (n ||= 100, typeof e == "number") return Math.ceil(e * t * n) / n;
	if (typeof e != "string") return e;
	let r = e.split(Xf);
	if (r === null || !r.length) return e;
	let i = [], a = r.shift(), o = Zf.test(a);
	for (;;) {
		if (o) {
			let e = parseFloat(a);
			isNaN(e) ? i.push(a) : i.push(Math.ceil(e * t * n) / n);
		} else i.push(a);
		if (a = r.shift(), a === void 0) return i.join("");
		o = !o;
	}
}
function $f(e, t = "defs") {
	let n = "", r = e.indexOf("<" + t);
	for (; r >= 0;) {
		let i = e.indexOf(">", r), a = e.indexOf("</" + t);
		if (i === -1 || a === -1) break;
		let o = e.indexOf(">", a);
		if (o === -1) break;
		n += e.slice(i + 1, a).trim(), e = e.slice(0, r).trim() + e.slice(o + 1);
	}
	return {
		defs: n,
		content: e
	};
}
function ep(e, t) {
	return e ? "<defs>" + e + "</defs>" + t : t;
}
function tp(e, t, n) {
	let r = $f(e);
	return ep(r.defs, t + r.content + n);
}
var np = (e) => e === "unset" || e === "undefined" || e === "none";
function rp(e, t) {
	let n = {
		...kf,
		...e
	}, r = {
		...Yf,
		...t
	}, i = {
		left: n.left,
		top: n.top,
		width: n.width,
		height: n.height
	}, a = n.body;
	[n, r].forEach((e) => {
		let t = [], n = e.hFlip, r = e.vFlip, o = e.rotate;
		n ? r ? o += 2 : (t.push("translate(" + (i.width + i.left).toString() + " " + (0 - i.top).toString() + ")"), t.push("scale(-1 1)"), i.top = i.left = 0) : r && (t.push("translate(" + (0 - i.left).toString() + " " + (i.height + i.top).toString() + ")"), t.push("scale(1 -1)"), i.top = i.left = 0);
		let s;
		switch (o < 0 && (o -= Math.floor(o / 4) * 4), o %= 4, o) {
			case 1:
				s = i.height / 2 + i.top, t.unshift("rotate(90 " + s.toString() + " " + s.toString() + ")");
				break;
			case 2:
				t.unshift("rotate(180 " + (i.width / 2 + i.left).toString() + " " + (i.height / 2 + i.top).toString() + ")");
				break;
			case 3: s = i.width / 2 + i.left, t.unshift("rotate(-90 " + s.toString() + " " + s.toString() + ")");
		}
		o % 2 == 1 && (i.left !== i.top && (s = i.left, i.left = i.top, i.top = s), i.width !== i.height && (s = i.width, i.width = i.height, i.height = s)), t.length && (a = tp(a, "<g transform=\"" + t.join(" ") + "\">", "</g>"));
	});
	let o = r.width, s = r.height, c = i.width, l = i.height, u, d;
	o === null ? (d = s === null ? "1em" : s === "auto" ? l : s, u = Qf(d, c / l)) : (u = o === "auto" ? c : o, d = s === null ? Qf(u, l / c) : s === "auto" ? l : s);
	let f = {}, p = (e, t) => {
		np(t) || (f[e] = t.toString());
	};
	p("width", u), p("height", d);
	let m = [
		i.left,
		i.top,
		c,
		l
	];
	return f.viewBox = m.join(" "), {
		attributes: f,
		viewBox: m,
		body: a
	};
}
var ip = /\sid="(\S+)"/g, ap = /* @__PURE__ */ new Map();
function op(e) {
	e = e.replace(/[0-9]+$/, "") || "a";
	let t = ap.get(e) || 0;
	return ap.set(e, t + 1), t ? `${e}${t}` : e;
}
function sp(e) {
	let t = [], n;
	for (; n = ip.exec(e);) t.push(n[1]);
	if (!t.length) return e;
	let r = "suffix" + (Math.random() * 16777216 | Date.now()).toString(16);
	return t.forEach((t) => {
		let n = op(t), i = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		e = e.replace(RegExp("([#;\"])(" + i + ")([\")]|\\.[a-z])", "g"), "$1" + n + r + "$3");
	}), e = e.replace(new RegExp(r, "g"), ""), e;
}
var cp = Object.create(null);
function lp(e, t) {
	cp[e] = t;
}
function up(e) {
	return cp[e] || cp[""];
}
function dp(e) {
	let t;
	if (typeof e.resources == "string") t = [e.resources];
	else if (t = e.resources, !(t instanceof Array) || !t.length) return null;
	return {
		resources: t,
		path: e.path || "/",
		maxURL: e.maxURL || 500,
		rotate: e.rotate || 750,
		timeout: e.timeout || 5e3,
		random: e.random === !0,
		index: e.index || 0,
		dataAfterTimeout: e.dataAfterTimeout !== !1
	};
}
for (var fp = Object.create(null), pp = ["https://api.simplesvg.com", "https://api.unisvg.com"], mp = []; pp.length > 0;) pp.length === 1 || Math.random() > .5 ? mp.push(pp.shift()) : mp.push(pp.pop());
fp[""] = dp({ resources: ["https://api.iconify.design"].concat(mp) });
function hp(e, t) {
	let n = dp(t);
	return n !== null && (fp[e] = n, !0);
}
function gp(e) {
	return fp[e];
}
var _p = (() => {
	let e;
	try {
		if (e = fetch, typeof e == "function") return e;
	} catch {}
})();
function vp(e, t) {
	let n = gp(e);
	if (!n) return 0;
	let r;
	if (!n.maxURL) r = 0;
	else {
		let e = 0;
		n.resources.forEach((t) => {
			e = Math.max(e, t.length);
		});
		let i = t + ".json?icons=";
		r = n.maxURL - e - n.path.length - i.length;
	}
	return r;
}
function yp(e) {
	return e === 404;
}
var bp = (e, t, n) => {
	let r = [], i = vp(e, t), a = "icons", o = {
		type: a,
		provider: e,
		prefix: t,
		icons: []
	}, s = 0;
	return n.forEach((n, c) => {
		s += n.length + 1, s >= i && c > 0 && (r.push(o), o = {
			type: a,
			provider: e,
			prefix: t,
			icons: []
		}, s = n.length), o.icons.push(n);
	}), r.push(o), r;
};
function xp(e) {
	if (typeof e == "string") {
		let t = gp(e);
		if (t) return t.path;
	}
	return "/";
}
var Sp = {
	prepare: bp,
	send: (e, t, n) => {
		if (!_p) {
			n("abort", 424);
			return;
		}
		let r = xp(t.provider);
		switch (t.type) {
			case "icons": {
				let e = t.prefix, n = t.icons.join(","), i = new URLSearchParams({ icons: n });
				r += e + ".json?" + i.toString();
				break;
			}
			case "custom": {
				let e = t.uri;
				r += e.slice(0, 1) === "/" ? e.slice(1) : e;
				break;
			}
			default:
				n("abort", 400);
				return;
		}
		let i = 503;
		_p(e + r).then((e) => {
			let t = e.status;
			if (t !== 200) {
				setTimeout(() => {
					n(yp(t) ? "abort" : "next", t);
				});
				return;
			}
			return i = 501, e.json();
		}).then((e) => {
			if (typeof e != "object" || !e) {
				setTimeout(() => {
					e === 404 ? n("abort", e) : n("next", i);
				});
				return;
			}
			setTimeout(() => {
				n("success", e);
			});
		}).catch(() => {
			n("next", i);
		});
	}
};
function Cp(e, t) {
	e.forEach((e) => {
		let n = e.loaderCallbacks;
		n && (e.loaderCallbacks = n.filter((e) => e.id !== t));
	});
}
function wp(e) {
	e.pendingCallbacksFlag || (e.pendingCallbacksFlag = !0, setTimeout(() => {
		e.pendingCallbacksFlag = !1;
		let t = e.loaderCallbacks ? e.loaderCallbacks.slice(0) : [];
		if (!t.length) return;
		let n = !1, r = e.provider, i = e.prefix;
		t.forEach((t) => {
			let a = t.icons, o = a.pending.length;
			a.pending = a.pending.filter((t) => {
				if (t.prefix !== i) return !0;
				let o = t.name;
				if (e.icons[o]) a.loaded.push({
					provider: r,
					prefix: i,
					name: o
				});
				else if (e.missing.has(o)) a.missing.push({
					provider: r,
					prefix: i,
					name: o
				});
				else return n = !0, !0;
				return !1;
			}), a.pending.length !== o && (n || Cp([e], t.id), t.callback(a.loaded.slice(0), a.missing.slice(0), a.pending.slice(0), t.abort));
		});
	}));
}
var Tp = 0;
function Ep(e, t, n) {
	let r = Tp++, i = Cp.bind(null, n, r);
	if (!t.pending.length) return i;
	let a = {
		id: r,
		icons: t,
		callback: e,
		abort: i
	};
	return n.forEach((e) => {
		(e.loaderCallbacks ||= []).push(a);
	}), i;
}
function Dp(e) {
	let t = {
		loaded: [],
		missing: [],
		pending: []
	}, n = Object.create(null);
	e.sort((e, t) => e.provider === t.provider ? e.prefix === t.prefix ? e.name.localeCompare(t.name) : e.prefix.localeCompare(t.prefix) : e.provider.localeCompare(t.provider));
	let r = {
		provider: "",
		prefix: "",
		name: ""
	};
	return e.forEach((e) => {
		if (r.name === e.name && r.prefix === e.prefix && r.provider === e.provider) return;
		r = e;
		let i = e.provider, a = e.prefix, o = e.name, s = n[i] || (n[i] = Object.create(null)), c = s[a] || (s[a] = Bf(i, a)), l;
		l = o in c.icons ? t.loaded : a === "" || c.missing.has(o) ? t.missing : t.pending;
		let u = {
			provider: i,
			prefix: a,
			name: o
		};
		l.push(u);
	}), t;
}
function Op(e, t = !0, n = !1) {
	let r = [];
	return e.forEach((e) => {
		let i = typeof e == "string" ? wf(e, t, n) : e;
		i && r.push(i);
	}), r;
}
var kp = {
	resources: [],
	index: 0,
	timeout: 2e3,
	rotate: 750,
	random: !1,
	dataAfterTimeout: !1
};
function Ap(e, t, n, r) {
	let i = e.resources.length, a = e.random ? Math.floor(Math.random() * i) : e.index, o;
	if (e.random) {
		let t = e.resources.slice(0);
		for (o = []; t.length > 1;) {
			let e = Math.floor(Math.random() * t.length);
			o.push(t[e]), t = t.slice(0, e).concat(t.slice(e + 1));
		}
		o = o.concat(t);
	} else o = e.resources.slice(a).concat(e.resources.slice(0, a));
	let s = Date.now(), c = "pending", l = 0, u, d = null, f = [], p = [];
	typeof r == "function" && p.push(r);
	function m() {
		d &&= (clearTimeout(d), null);
	}
	function h() {
		c === "pending" && (c = "aborted"), m(), f.forEach((e) => {
			e.status === "pending" && (e.status = "aborted");
		}), f = [];
	}
	function g(e, t) {
		t && (p = []), typeof e == "function" && p.push(e);
	}
	function _() {
		return {
			startTime: s,
			payload: t,
			status: c,
			queriesSent: l,
			queriesPending: f.length,
			subscribe: g,
			abort: h
		};
	}
	function v() {
		c = "failed", p.forEach((e) => {
			e(void 0, u);
		});
	}
	function y() {
		f.forEach((e) => {
			e.status === "pending" && (e.status = "aborted");
		}), f = [];
	}
	function b(t, n, r) {
		let i = n !== "success";
		switch (f = f.filter((e) => e !== t), c) {
			case "pending": break;
			case "failed":
				if (i || !e.dataAfterTimeout) return;
				break;
			default: return;
		}
		if (n === "abort") {
			u = r, v();
			return;
		}
		if (i) {
			u = r, f.length || (o.length ? x() : v());
			return;
		}
		if (m(), y(), !e.random) {
			let n = e.resources.indexOf(t.resource);
			n !== -1 && n !== e.index && (e.index = n);
		}
		c = "completed", p.forEach((e) => {
			e(r);
		});
	}
	function x() {
		if (c !== "pending") return;
		m();
		let r = o.shift();
		if (r === void 0) {
			if (f.length) {
				d = setTimeout(() => {
					m(), c === "pending" && (y(), v());
				}, e.timeout);
				return;
			}
			v();
			return;
		}
		let i = {
			status: "pending",
			resource: r,
			callback: (e, t) => {
				b(i, e, t);
			}
		};
		f.push(i), l++, d = setTimeout(x, e.rotate), n(r, t, i.callback);
	}
	return setTimeout(x), _;
}
function jp(e) {
	let t = {
		...kp,
		...e
	}, n = [];
	function r() {
		n = n.filter((e) => e().status === "pending");
	}
	function i(e, i, a) {
		let o = Ap(t, e, i, (e, t) => {
			r(), a && a(e, t);
		});
		return n.push(o), o;
	}
	function a(e) {
		return n.find((t) => e(t)) || null;
	}
	return {
		query: i,
		find: a,
		setIndex: (e) => {
			t.index = e;
		},
		getIndex: () => t.index,
		cleanup: r
	};
}
function Mp() {}
var Np = Object.create(null);
function Pp(e) {
	if (!Np[e]) {
		let t = gp(e);
		if (!t) return;
		Np[e] = {
			config: t,
			redundancy: jp(t)
		};
	}
	return Np[e];
}
function Fp(e, t, n) {
	let r, i;
	if (typeof e == "string") {
		let t = up(e);
		if (!t) return n(void 0, 424), Mp;
		i = t.send;
		let a = Pp(e);
		a && (r = a.redundancy);
	} else {
		let t = dp(e);
		if (t) {
			r = jp(t);
			let n = up(e.resources ? e.resources[0] : "");
			n && (i = n.send);
		}
	}
	return !r || !i ? (n(void 0, 424), Mp) : r.query(t, i, n)().abort;
}
function Ip() {}
function Lp(e) {
	e.iconsLoaderFlag || (e.iconsLoaderFlag = !0, setTimeout(() => {
		e.iconsLoaderFlag = !1, wp(e);
	}));
}
function Rp(e) {
	let t = [], n = [];
	return e.forEach((e) => {
		(e.match(Cf) ? t : n).push(e);
	}), {
		valid: t,
		invalid: n
	};
}
function zp(e, t, n) {
	function r() {
		let n = e.pendingIcons;
		t.forEach((t) => {
			n && n.delete(t), e.icons[t] || e.missing.add(t);
		});
	}
	if (n && typeof n == "object") try {
		if (!Vf(e, n).length) {
			r();
			return;
		}
	} catch (e) {
		console.error(e);
	}
	r(), Lp(e);
}
function Bp(e, t) {
	e instanceof Promise ? e.then((e) => {
		t(e);
	}).catch(() => {
		t(null);
	}) : t(e);
}
function Vp(e, t) {
	e.iconsToLoad = e.iconsToLoad ? e.iconsToLoad.concat(t).sort() : t, e.iconsQueueFlag || (e.iconsQueueFlag = !0, setTimeout(() => {
		e.iconsQueueFlag = !1;
		let { provider: t, prefix: n } = e, r = e.iconsToLoad;
		if (delete e.iconsToLoad, !r || !r.length) return;
		let i = e.loadIcon;
		if (e.loadIcons && (r.length > 1 || !i)) {
			Bp(e.loadIcons(r, n, t), (t) => {
				zp(e, r, t);
			});
			return;
		}
		if (i) {
			r.forEach((r) => {
				Bp(i(r, n, t), (t) => {
					zp(e, [r], t ? {
						prefix: n,
						icons: { [r]: t }
					} : null);
				});
			});
			return;
		}
		let { valid: a, invalid: o } = Rp(r);
		if (o.length && zp(e, o, null), !a.length) return;
		let s = n.match(Cf) ? up(t) : null;
		if (!s) {
			zp(e, a, null);
			return;
		}
		s.prepare(t, n, a).forEach((n) => {
			Fp(t, n, (t) => {
				zp(e, n.icons, t);
			});
		});
	}));
}
var Hp = (e, t) => {
	let n = Dp(Op(e, !0, Wf()));
	if (!n.pending.length) {
		let e = !0;
		return t && setTimeout(() => {
			e && t(n.loaded, n.missing, n.pending, Ip);
		}), () => {
			e = !1;
		};
	}
	let r = Object.create(null), i = [], a, o;
	return n.pending.forEach((e) => {
		let { provider: t, prefix: n } = e;
		if (n === o && t === a) return;
		a = t, o = n, i.push(Bf(t, n));
		let s = r[t] || (r[t] = Object.create(null));
		s[n] || (s[n] = []);
	}), n.pending.forEach((e) => {
		let { provider: t, prefix: n, name: i } = e, a = Bf(t, n), o = a.pendingIcons ||= /* @__PURE__ */ new Set();
		o.has(i) || (o.add(i), r[t][n].push(i));
	}), i.forEach((e) => {
		let t = r[e.provider][e.prefix];
		t.length && Vp(e, t);
	}), t ? Ep(t, n, i) : Ip;
};
function Up(e, t) {
	let n = { ...e };
	for (let e in t) {
		let r = t[e], i = typeof r;
		e in Jf ? (r === null || r && (i === "string" || i === "number")) && (n[e] = r) : i === typeof n[e] && (n[e] = e === "rotate" ? r % 4 : r);
	}
	return n;
}
var Wp = /[\s,]+/;
function Gp(e, t) {
	t.split(Wp).forEach((t) => {
		switch (t.trim()) {
			case "horizontal":
				e.hFlip = !0;
				break;
			case "vertical": e.vFlip = !0;
		}
	});
}
function Kp(e, t = 0) {
	let n = e.replace(/^-?[0-9.]*/, "");
	function r(e) {
		for (; e < 0;) e += 4;
		return e % 4;
	}
	if (n === "") {
		let t = parseInt(e);
		return isNaN(t) ? 0 : r(t);
	}
	if (n !== e) {
		let t = 0;
		switch (n) {
			case "%":
				t = 25;
				break;
			case "deg": t = 90;
		}
		if (t) {
			let i = parseFloat(e.slice(0, e.length - n.length));
			return isNaN(i) ? 0 : (i /= t, i % 1 == 0 ? r(i) : 0);
		}
	}
	return t;
}
function qp(e, t) {
	let n = e.indexOf("xlink:") === -1 ? "" : " xmlns:xlink=\"http://www.w3.org/1999/xlink\"";
	for (let e in t) n += " " + e + "=\"" + t[e] + "\"";
	return "<svg xmlns=\"http://www.w3.org/2000/svg\"" + n + ">" + e + "</svg>";
}
function Jp(e) {
	return e.replace(/"/g, "'").replace(/%/g, "%25").replace(/#/g, "%23").replace(/</g, "%3C").replace(/>/g, "%3E").replace(/\s+/g, " ");
}
function Yp(e) {
	return "data:image/svg+xml," + Jp(e);
}
function Xp(e) {
	return "url(\"" + Yp(e) + "\")";
}
var Zp = {
	...Yf,
	inline: !1
}, Qp = {
	xmlns: "http://www.w3.org/2000/svg",
	"xmlns:xlink": "http://www.w3.org/1999/xlink",
	"aria-hidden": !0,
	role: "img"
}, $p = { display: "inline-block" }, em = { backgroundColor: "currentColor" }, tm = { backgroundColor: "transparent" }, nm = {
	Image: "var(--svg)",
	Repeat: "no-repeat",
	Size: "100% 100%"
}, rm = {
	webkitMask: em,
	mask: em,
	background: tm
};
for (let e in rm) {
	let t = rm[e];
	for (let n in nm) t[e + n] = nm[n];
}
var im = {};
["horizontal", "vertical"].forEach((e) => {
	let t = e.slice(0, 1) + "Flip";
	im[e + "-flip"] = t, im[e.slice(0, 1) + "-flip"] = t, im[e + "Flip"] = t;
});
function am(e) {
	return e + (e.match(/^[-0-9.]+$/) ? "px" : "");
}
var om = (e, t) => {
	let n = Up(Zp, t), r = { ...Qp }, i = t.mode || "svg", a = {}, o = t.style, s = typeof o == "object" && !(o instanceof Array) ? o : {};
	for (let e in t) {
		let i = t[e];
		if (i !== void 0) switch (e) {
			case "icon":
			case "style":
			case "onLoad":
			case "mode":
			case "ssr":
			case "customise": break;
			case "inline":
			case "hFlip":
			case "vFlip":
				n[e] = i === !0 || i === "true" || i === 1;
				break;
			case "flip":
				typeof i == "string" && Gp(n, i);
				break;
			case "color":
				a.color = i;
				break;
			case "rotate":
				typeof i == "string" ? n[e] = Kp(i) : typeof i == "number" && (n[e] = i);
				break;
			case "ariaHidden":
			case "aria-hidden":
				i !== !0 && i !== "true" && delete r["aria-hidden"];
				break;
			default: {
				let t = im[e];
				t ? (i === !0 || i === "true" || i === 1) && (n[t] = !0) : Zp[e] === void 0 && (r[e] = i);
			}
		}
	}
	let c = rp(e, n), l = c.attributes;
	if (n.inline && (a.verticalAlign = "-0.125em"), i === "svg") return r.style = {
		...a,
		...s
	}, Object.assign(r, l), r.innerHTML = sp(c.body), to("svg", r);
	let { body: u, width: d, height: f } = e, p = i === "mask" || i !== "bg" && u.indexOf("currentColor") !== -1, m = qp(u, {
		...l,
		width: d + "",
		height: f + ""
	});
	return r.style = {
		...a,
		"--svg": Xp(m),
		width: am(l.width),
		height: am(l.height),
		...$p,
		...p ? em : tm,
		...s
	}, to("span", r);
};
if (Wf(!0), lp("", Sp), typeof document < "u" && typeof window < "u") {
	let e = window;
	if (e.IconifyPreload !== void 0) {
		let t = e.IconifyPreload, n = "Invalid IconifyPreload syntax.";
		typeof t == "object" && t && (t instanceof Array ? t : [t]).forEach((e) => {
			try {
				(typeof e != "object" || !e || e instanceof Array || typeof e.icons != "object" || typeof e.prefix != "string" || !qf(e)) && console.error(n);
			} catch {
				console.error(n);
			}
		});
	}
	if (e.IconifyProviders !== void 0) {
		let t = e.IconifyProviders;
		if (typeof t == "object" && t) for (let e in t) {
			let n = "IconifyProviders[" + e + "] is invalid.";
			try {
				let r = t[e];
				if (typeof r != "object" || !r || r.resources === void 0) continue;
				hp(e, r) || console.error(n);
			} catch {
				console.error(n);
			}
		}
	}
}
var sm = {
	...kf,
	body: ""
}, cm = /* @__PURE__ */ z((e, { emit: t }) => {
	let n = /* @__PURE__ */ I(null);
	function r() {
		n.value &&= (n.value.abort?.(), null);
	}
	let i = /* @__PURE__ */ I(!!e.ssr), a = /* @__PURE__ */ I(""), o = /* @__PURE__ */ Xt(null);
	function s() {
		let i = e.icon;
		if (typeof i == "object" && i && typeof i.body == "string") return a.value = "", { data: i };
		let o;
		if (typeof i != "string" || (o = wf(i, !1, !0)) === null) return null;
		let s = Gf(o);
		if (!s) {
			let e = n.value;
			return (!e || e.name !== i) && (s === null ? n.value = { name: i } : n.value = {
				name: i,
				abort: Hp([o], c)
			}), null;
		}
		r(), a.value !== i && (a.value = i, An(() => {
			t("load", i);
		}));
		let l = e.customise;
		if (l) {
			s = Object.assign({}, s);
			let e = l(s.body, o.name, o.prefix, o.provider);
			typeof e == "string" && (s.body = e);
		}
		let u = ["iconify"];
		return o.prefix !== "" && u.push("iconify--" + o.prefix), o.provider !== "" && u.push("iconify--" + o.provider), {
			data: s,
			classes: u
		};
	}
	function c() {
		let e = s();
		e ? e.data !== o.value?.data && (o.value = e) : o.value = null;
	}
	return i.value ? c() : Pr(() => {
		i.value = !0, c();
	}), Xn(() => e.icon, c), Rr(r), () => {
		let t = o.value;
		if (!t) return om(sm, e);
		let n = e;
		return t.classes && (n = {
			...e,
			class: t.classes.join(" ")
		}), om({
			...kf,
			...t.data
		}, n);
	};
}, {
	props: [
		"icon",
		"mode",
		"ssr",
		"width",
		"height",
		"style",
		"color",
		"inline",
		"rotate",
		"hFlip",
		"horizontalFlip",
		"vFlip",
		"verticalFlip",
		"flip",
		"id",
		"ariaHidden",
		"customise",
		"title"
	],
	emits: ["load"]
}), lm = {
	__name: "Icon",
	props: {
		name: {
			type: null,
			required: !0
		},
		mode: {
			type: String,
			required: !1
		},
		size: {
			type: [String, Number],
			required: !1
		},
		customize: {
			type: [
				Function,
				Boolean,
				null
			],
			required: !1
		}
	},
	setup(e) {
		let t = e, n = bc();
		function r(e, t) {
			if (e !== !1) return e === !0 || e === null ? t : e;
		}
		let i = X(() => {
			let e = t.mode || n.icon?.mode;
			return e === "css" ? "style" : e;
		}), a = X(() => t.size || n.icon?.size), o = X(() => r(t.customize, n.icon?.customize));
		return (t, n) => typeof e.name == "string" ? (H(), W(L(cm), {
			key: 0,
			icon: e.name.replace(/^i-/, ""),
			mode: i.value,
			width: a.value,
			height: a.value,
			customise: o.value
		}, null, 8, [
			"icon",
			"mode",
			"width",
			"height",
			"customise"
		])) : (H(), W(Gr(e.name), { key: 1 }));
	}
}, um = Symbol("nuxt-ui.avatar-group");
function dm(e) {
	let t = Wn(um, void 0), n = X(() => e.size ?? t?.value.size), r = X(() => e.color ?? t?.value.color);
	return Un(um, X(() => ({
		size: n.value,
		color: r.value
	}))), {
		size: n,
		color: r
	};
}
//#endregion
//#region virtual:nuxt-ui-templates/ui/chip.ts
var fm = {
	slots: {
		root: "relative inline-flex items-center justify-center shrink-0",
		base: "rounded-full ring ring-bg flex items-center justify-center text-inverted font-medium whitespace-nowrap"
	},
	variants: {
		color: {
			primary: "bg-primary",
			secondary: "bg-secondary",
			success: "bg-success",
			info: "bg-info",
			warning: "bg-warning",
			error: "bg-error",
			neutral: "bg-inverted"
		},
		size: {
			"3xs": "h-[4px] min-w-[4px] text-[4px]",
			"2xs": "h-[5px] min-w-[5px] text-[5px]",
			xs: "h-[6px] min-w-[6px] text-[6px]",
			sm: "h-[7px] min-w-[7px] text-[7px]",
			md: "h-[8px] min-w-[8px] text-[8px]",
			lg: "h-[9px] min-w-[9px] text-[9px]",
			xl: "h-[10px] min-w-[10px] text-[10px]",
			"2xl": "h-[11px] min-w-[11px] text-[11px]",
			"3xl": "h-[12px] min-w-[12px] text-[12px]"
		},
		position: {
			"top-right": "top-0 right-0",
			"bottom-right": "bottom-0 right-0",
			"top-left": "top-0 left-0",
			"bottom-left": "bottom-0 left-0"
		},
		inset: { false: "" },
		standalone: { false: "absolute" }
	},
	compoundVariants: [
		{
			position: "top-right",
			inset: !1,
			class: "-translate-y-1/2 translate-x-1/2 transform"
		},
		{
			position: "bottom-right",
			inset: !1,
			class: "translate-y-1/2 translate-x-1/2 transform"
		},
		{
			position: "top-left",
			inset: !1,
			class: "-translate-y-1/2 -translate-x-1/2 transform"
		},
		{
			position: "bottom-left",
			inset: !1,
			class: "translate-y-1/2 -translate-x-1/2 transform"
		}
	],
	defaultVariants: {
		size: "md",
		color: "primary",
		position: "top-right"
	}
}, pm = /*@__PURE__*/ Object.assign({ inheritAttrs: !1 }, {
	__name: "Chip",
	props: /*@__PURE__*/ ri({
		as: {
			type: null,
			required: !1
		},
		text: {
			type: [String, Number],
			required: !1
		},
		color: {
			type: null,
			required: !1
		},
		size: {
			type: null,
			required: !1
		},
		position: {
			type: null,
			required: !1
		},
		inset: {
			type: Boolean,
			required: !1,
			default: !1
		},
		standalone: {
			type: Boolean,
			required: !1,
			default: !1
		},
		class: {
			type: null,
			required: !1
		},
		ui: {
			type: Object,
			required: !1
		}
	}, {
		show: {
			type: Boolean,
			default: !0
		},
		showModifiers: {}
	}),
	emits: ["update:show"],
	setup(e) {
		let t = e, n = nu("chip", t), r = Ci(e, "show", {
			type: Boolean,
			default: !0
		}), { size: i } = dm(t), a = bc(), o = X(() => bf({
			extend: bf(fm),
			...a.ui?.chip || {}
		})({
			color: n.color,
			size: i.value ?? n.size,
			position: n.position,
			inset: n.inset,
			standalone: n.standalone
		}));
		return (e, t) => (H(), W(L(rl), {
			as: L(n).as,
			"data-slot": "root",
			class: A(o.value.root({ class: [L(n).ui?.root, L(n).class] }))
		}, {
			default: R(() => [K(L(tl), j(Da(e.$attrs)), {
				default: R(() => [B(e.$slots, "default")]),
				_: 3
			}, 16), r.value ? (H(), U("span", {
				key: 0,
				"data-slot": "base",
				class: A(o.value.base({ class: L(n).ui?.base }))
			}, [B(e.$slots, "content", {}, () => [q(M(L(n).text), 1)])], 2)) : J("", !0)]),
			_: 3
		}, 8, ["as", "class"]));
	}
}), mm = {
	slots: {
		root: "inline-flex items-center justify-center shrink-0 select-none rounded-full align-middle",
		image: "h-full w-full rounded-[inherit] object-cover",
		fallback: "font-medium truncate",
		icon: "shrink-0"
	},
	variants: {
		color: {
			primary: {
				root: "bg-primary/10",
				fallback: "text-primary",
				icon: "text-primary"
			},
			secondary: {
				root: "bg-secondary/10",
				fallback: "text-secondary",
				icon: "text-secondary"
			},
			success: {
				root: "bg-success/10",
				fallback: "text-success",
				icon: "text-success"
			},
			info: {
				root: "bg-info/10",
				fallback: "text-info",
				icon: "text-info"
			},
			warning: {
				root: "bg-warning/10",
				fallback: "text-warning",
				icon: "text-warning"
			},
			error: {
				root: "bg-error/10",
				fallback: "text-error",
				icon: "text-error"
			},
			neutral: {
				root: "bg-elevated",
				fallback: "text-muted",
				icon: "text-muted"
			}
		},
		size: {
			"3xs": { root: "size-4 text-[8px]" },
			"2xs": { root: "size-5 text-[10px]" },
			xs: { root: "size-6 text-xs" },
			sm: { root: "size-7 text-sm" },
			md: { root: "size-8 text-base" },
			lg: { root: "size-9 text-lg" },
			xl: { root: "size-10 text-xl" },
			"2xl": { root: "size-11 text-[22px]" },
			"3xl": { root: "size-12 text-2xl" }
		}
	},
	defaultVariants: {
		size: "md",
		color: "neutral"
	}
}, hm = /*@__PURE__*/ Object.assign({ inheritAttrs: !1 }, {
	__name: "Avatar",
	props: {
		as: {
			type: null,
			required: !1
		},
		src: {
			type: String,
			required: !1
		},
		alt: {
			type: String,
			required: !1
		},
		icon: {
			type: null,
			required: !1
		},
		text: {
			type: String,
			required: !1
		},
		size: {
			type: null,
			required: !1
		},
		color: {
			type: null,
			required: !1
		},
		chip: {
			type: [Boolean, Object],
			required: !1
		},
		class: {
			type: null,
			required: !1
		},
		style: {
			type: null,
			required: !1
		},
		ui: {
			type: Object,
			required: !1
		}
	},
	setup(e) {
		let t = e, n = nu("avatar", t), r = X(() => typeof n.as == "string" || typeof n.as?.render == "function" ? { root: n.as } : rs(n.as, { root: "span" })), i = X(() => n.text || (n.alt || "").split(" ").map((e) => e.charAt(0)).join("").substring(0, 2)), a = bc(), { size: o, color: s } = dm(t), c = X(() => bf({
			extend: bf(mm),
			...a.ui?.avatar || {}
		})({
			size: o.value ?? n.size,
			color: s.value ?? n.color
		})), l = X(() => c.value.root({ class: [n.ui?.root, n.class] })), u = X(() => {
			let e = (l.value || "").split(" ").find((e) => /^size-\d+$/.test(e));
			if (e) {
				let t = Number.parseFloat(e.split("-")[1] ?? "");
				if (!Number.isNaN(t)) return t * 4;
			}
			return null;
		}), d = /* @__PURE__ */ I(!1);
		Xn(() => n.src, () => {
			d.value &&= !1;
		});
		function f() {
			d.value = !0;
		}
		return (e, t) => (H(), W(Gr(L(n).chip ? pm : L(rl)), Y({ as: r.value.root }, L(n).chip ? typeof L(n).chip == "object" ? {
			inset: !0,
			...L(n).chip
		} : { inset: !0 } : {}, {
			"data-slot": "root",
			class: l.value,
			style: L(n).style
		}), {
			default: R(() => [L(n).src && !d.value ? (H(), W(Gr(r.value.img || L("img")), Y({
				key: 0,
				src: L(n).src,
				alt: L(n).alt,
				width: u.value,
				height: u.value
			}, e.$attrs, {
				"data-slot": "image",
				class: c.value.image({ class: L(n).ui?.image }),
				onError: f
			}), null, 16, [
				"src",
				"alt",
				"width",
				"height",
				"class"
			])) : (H(), W(L(tl), j(Y({ key: 1 }, e.$attrs)), {
				default: R(() => [B(e.$slots, "default", {}, () => [L(n).icon ? (H(), W(lm, {
					key: 0,
					name: L(n).icon,
					"data-slot": "icon",
					class: A(c.value.icon({ class: L(n).ui?.icon }))
				}, null, 8, ["name", "class"])) : (H(), U("span", {
					key: 1,
					"data-slot": "fallback",
					class: A(c.value.fallback({ class: L(n).ui?.fallback }))
				}, M(i.value || "\xA0"), 3))])]),
				_: 3
			}, 16))]),
			_: 3
		}, 16, [
			"as",
			"class",
			"style"
		]));
	}
}), gm = {
	__name: "LinkBase",
	props: {
		as: {
			type: String,
			required: !1,
			default: "button"
		},
		type: {
			type: String,
			required: !1,
			default: "button"
		},
		disabled: {
			type: Boolean,
			required: !1
		},
		onClick: {
			type: [Function, Array],
			required: !1
		},
		href: {
			type: [String, null],
			required: !1
		},
		navigate: {
			type: Function,
			required: !1
		},
		target: {
			type: [
				String,
				Object,
				null
			],
			required: !1
		},
		rel: {
			type: [
				String,
				Object,
				null
			],
			required: !1
		},
		active: {
			type: Boolean,
			required: !1
		},
		isExternal: {
			type: Boolean,
			required: !1
		}
	},
	setup(e) {
		let t = e;
		function n(e) {
			if (t.disabled) {
				e.stopPropagation(), e.preventDefault();
				return;
			}
			if (t.onClick) for (let n of Array.isArray(t.onClick) ? t.onClick : [t.onClick]) n(e);
			t.href && t.navigate && !t.isExternal && t.navigate(e);
		}
		return (t, r) => (H(), W(L(rl), Y(e.href ? {
			as: "a",
			href: e.disabled ? void 0 : e.href,
			"aria-disabled": e.disabled ? "true" : void 0,
			role: e.disabled ? "link" : void 0,
			tabindex: e.disabled ? -1 : void 0
		} : e.as === "button" ? {
			as: e.as,
			type: e.type,
			disabled: e.disabled
		} : { as: e.as }, {
			rel: e.rel,
			target: e.target,
			onClick: n
		}), {
			default: R(() => [B(t.$slots, "default")]),
			_: 3
		}, 16, ["rel", "target"]));
	}
}, _m = {
	base: "outline-primary/25 focus-visible:outline-3 rounded-md",
	variants: {
		active: {
			true: "text-primary",
			false: "text-muted"
		},
		disabled: { true: "cursor-not-allowed opacity-75" }
	},
	compoundVariants: [{
		active: !1,
		disabled: !1,
		class: ["hover:text-default", "transition-colors"]
	}]
}, vm = /*@__PURE__*/ Object.assign({ inheritAttrs: !1 }, {
	__name: "Link",
	props: {
		as: {
			type: null,
			required: !1,
			default: "button"
		},
		type: {
			type: null,
			required: !1,
			default: "button"
		},
		disabled: {
			type: Boolean,
			required: !1
		},
		active: {
			type: Boolean,
			required: !1,
			default: void 0
		},
		exact: {
			type: Boolean,
			required: !1
		},
		exactQuery: {
			type: [Boolean, String],
			required: !1
		},
		exactHash: {
			type: Boolean,
			required: !1
		},
		inactiveClass: {
			type: String,
			required: !1
		},
		activeClass: {
			type: String,
			required: !1
		},
		ariaCurrentValue: {
			type: String,
			required: !1,
			default: "page"
		},
		custom: {
			type: Boolean,
			required: !1
		},
		raw: {
			type: Boolean,
			required: !1
		},
		class: {
			type: null,
			required: !1
		},
		to: {
			type: String,
			required: !1
		},
		href: {
			type: String,
			required: !1
		},
		external: {
			type: Boolean,
			required: !1
		},
		target: {
			type: [
				String,
				Object,
				null
			],
			required: !1
		},
		rel: {
			type: [
				String,
				Object,
				null
			],
			required: !1
		},
		noRel: {
			type: Boolean,
			required: !1
		}
	},
	setup(e) {
		let t = e, n = bc(), r = X(() => bf({
			extend: bf(_m),
			...rs({ variants: { active: {
				true: kc(n.ui?.link?.variants?.active?.true, t.activeClass),
				false: kc(n.ui?.link?.variants?.active?.false, t.inactiveClass)
			} } }, n.ui?.link || {})
		})), i = X(() => t.to ?? t.href), a = X(() => t.target === "_blank" || t.external ? !0 : i.value ? Tc(i.value, { acceptRelative: !0 }) : !1), o = X(() => t.active !== void 0 && t.active), s = X(() => {
			let e = o.value;
			return t.raw ? [t.class, e ? t.activeClass : t.inactiveClass] : r.value({
				class: t.class,
				active: e,
				disabled: t.disabled
			});
		}), c = X(() => t.noRel ? null : t.rel ? t.rel : a.value ? "noopener noreferrer" : null), l = Wn("nuxtui:router", void 0), u = l ? (e) => {
			l(e, {
				href: i.value || "",
				external: a.value,
				target: t.target || (a.value ? "_blank" : void 0)
			});
		} : void 0;
		return (t, n) => e.custom ? (H(), W(L(tl), { key: 0 }, {
			default: R(() => [B(t.$slots, "default", j(Da({
				...t.$attrs,
				as: e.as,
				type: e.type,
				disabled: e.disabled,
				href: i.value,
				navigate: L(u),
				rel: c.value,
				target: e.target || (a.value ? "_blank" : void 0),
				isExternal: a.value,
				active: o.value
			})))]),
			_: 3
		})) : (H(), W(gm, Y({ key: 1 }, {
			...t.$attrs,
			as: e.as,
			type: e.type,
			disabled: e.disabled,
			href: i.value,
			navigate: L(u),
			rel: c.value,
			target: e.target || (a.value ? "_blank" : void 0),
			isExternal: a.value
		}, { class: s.value }), {
			default: R(() => [B(t.$slots, "default", { active: o.value })]),
			_: 3
		}, 16, ["class"]));
	}
}), ym = {
	slots: {
		base: ["rounded-md font-medium inline-flex items-center disabled:cursor-not-allowed aria-disabled:cursor-not-allowed disabled:opacity-75 aria-disabled:opacity-75", "transition-colors"],
		label: "truncate",
		leadingIcon: "shrink-0",
		leadingAvatar: "shrink-0",
		leadingAvatarSize: "",
		trailingIcon: "shrink-0"
	},
	variants: {
		fieldGroup: {
			horizontal: "not-only:first:rounded-e-none not-only:last:rounded-s-none not-last:not-first:rounded-none focus-visible:z-[1]",
			vertical: "not-only:first:rounded-b-none not-only:last:rounded-t-none not-last:not-first:rounded-none focus-visible:z-[1]"
		},
		color: {
			primary: "",
			secondary: "",
			success: "",
			info: "",
			warning: "",
			error: "",
			neutral: ""
		},
		variant: {
			solid: "",
			outline: "",
			soft: "",
			subtle: "",
			ghost: "",
			link: ""
		},
		size: {
			xs: {
				base: "px-2 py-1 text-xs gap-1",
				leadingIcon: "size-4",
				leadingAvatarSize: "3xs",
				trailingIcon: "size-4"
			},
			sm: {
				base: "px-2.5 py-1.5 text-xs gap-1.5",
				leadingIcon: "size-4",
				leadingAvatarSize: "3xs",
				trailingIcon: "size-4"
			},
			md: {
				base: "px-2.5 py-1.5 text-sm gap-1.5",
				leadingIcon: "size-5",
				leadingAvatarSize: "2xs",
				trailingIcon: "size-5"
			},
			lg: {
				base: "px-3 py-2 text-sm gap-2",
				leadingIcon: "size-5",
				leadingAvatarSize: "2xs",
				trailingIcon: "size-5"
			},
			xl: {
				base: "px-3 py-2 text-base gap-2",
				leadingIcon: "size-6",
				leadingAvatarSize: "xs",
				trailingIcon: "size-6"
			}
		},
		block: { true: {
			base: "w-full justify-center",
			trailingIcon: "ms-auto"
		} },
		square: { true: "" },
		leading: { true: "" },
		trailing: { true: "" },
		loading: { true: "" },
		active: {
			true: { base: "" },
			false: { base: "" }
		}
	},
	compoundVariants: [
		{
			color: "primary",
			variant: "solid",
			class: "text-inverted bg-primary hover:bg-primary/75 active:bg-primary/75 disabled:bg-primary aria-disabled:bg-primary outline-primary/25 focus-visible:outline-3"
		},
		{
			color: "secondary",
			variant: "solid",
			class: "text-inverted bg-secondary hover:bg-secondary/75 active:bg-secondary/75 disabled:bg-secondary aria-disabled:bg-secondary outline-secondary/25 focus-visible:outline-3"
		},
		{
			color: "success",
			variant: "solid",
			class: "text-inverted bg-success hover:bg-success/75 active:bg-success/75 disabled:bg-success aria-disabled:bg-success outline-success/25 focus-visible:outline-3"
		},
		{
			color: "info",
			variant: "solid",
			class: "text-inverted bg-info hover:bg-info/75 active:bg-info/75 disabled:bg-info aria-disabled:bg-info outline-info/25 focus-visible:outline-3"
		},
		{
			color: "warning",
			variant: "solid",
			class: "text-inverted bg-warning hover:bg-warning/75 active:bg-warning/75 disabled:bg-warning aria-disabled:bg-warning outline-warning/25 focus-visible:outline-3"
		},
		{
			color: "error",
			variant: "solid",
			class: "text-inverted bg-error hover:bg-error/75 active:bg-error/75 disabled:bg-error aria-disabled:bg-error outline-error/25 focus-visible:outline-3"
		},
		{
			color: "primary",
			variant: "outline",
			class: "ring ring-inset ring-primary/50 text-primary hover:bg-primary/10 active:bg-primary/10 disabled:bg-transparent aria-disabled:bg-transparent dark:disabled:bg-transparent dark:aria-disabled:bg-transparent outline-primary/25 focus-visible:outline-3 focus-visible:ring-primary"
		},
		{
			color: "secondary",
			variant: "outline",
			class: "ring ring-inset ring-secondary/50 text-secondary hover:bg-secondary/10 active:bg-secondary/10 disabled:bg-transparent aria-disabled:bg-transparent dark:disabled:bg-transparent dark:aria-disabled:bg-transparent outline-secondary/25 focus-visible:outline-3 focus-visible:ring-secondary"
		},
		{
			color: "success",
			variant: "outline",
			class: "ring ring-inset ring-success/50 text-success hover:bg-success/10 active:bg-success/10 disabled:bg-transparent aria-disabled:bg-transparent dark:disabled:bg-transparent dark:aria-disabled:bg-transparent outline-success/25 focus-visible:outline-3 focus-visible:ring-success"
		},
		{
			color: "info",
			variant: "outline",
			class: "ring ring-inset ring-info/50 text-info hover:bg-info/10 active:bg-info/10 disabled:bg-transparent aria-disabled:bg-transparent dark:disabled:bg-transparent dark:aria-disabled:bg-transparent outline-info/25 focus-visible:outline-3 focus-visible:ring-info"
		},
		{
			color: "warning",
			variant: "outline",
			class: "ring ring-inset ring-warning/50 text-warning hover:bg-warning/10 active:bg-warning/10 disabled:bg-transparent aria-disabled:bg-transparent dark:disabled:bg-transparent dark:aria-disabled:bg-transparent outline-warning/25 focus-visible:outline-3 focus-visible:ring-warning"
		},
		{
			color: "error",
			variant: "outline",
			class: "ring ring-inset ring-error/50 text-error hover:bg-error/10 active:bg-error/10 disabled:bg-transparent aria-disabled:bg-transparent dark:disabled:bg-transparent dark:aria-disabled:bg-transparent outline-error/25 focus-visible:outline-3 focus-visible:ring-error"
		},
		{
			color: "primary",
			variant: "soft",
			class: "text-primary bg-primary/10 hover:bg-primary/15 active:bg-primary/15 outline-primary/25 focus-visible:outline-3 disabled:bg-primary/10 aria-disabled:bg-primary/10"
		},
		{
			color: "secondary",
			variant: "soft",
			class: "text-secondary bg-secondary/10 hover:bg-secondary/15 active:bg-secondary/15 outline-secondary/25 focus-visible:outline-3 disabled:bg-secondary/10 aria-disabled:bg-secondary/10"
		},
		{
			color: "success",
			variant: "soft",
			class: "text-success bg-success/10 hover:bg-success/15 active:bg-success/15 outline-success/25 focus-visible:outline-3 disabled:bg-success/10 aria-disabled:bg-success/10"
		},
		{
			color: "info",
			variant: "soft",
			class: "text-info bg-info/10 hover:bg-info/15 active:bg-info/15 outline-info/25 focus-visible:outline-3 disabled:bg-info/10 aria-disabled:bg-info/10"
		},
		{
			color: "warning",
			variant: "soft",
			class: "text-warning bg-warning/10 hover:bg-warning/15 active:bg-warning/15 outline-warning/25 focus-visible:outline-3 disabled:bg-warning/10 aria-disabled:bg-warning/10"
		},
		{
			color: "error",
			variant: "soft",
			class: "text-error bg-error/10 hover:bg-error/15 active:bg-error/15 outline-error/25 focus-visible:outline-3 disabled:bg-error/10 aria-disabled:bg-error/10"
		},
		{
			color: "primary",
			variant: "subtle",
			class: "text-primary ring ring-inset ring-primary/25 bg-primary/10 hover:bg-primary/15 active:bg-primary/15 disabled:bg-primary/10 aria-disabled:bg-primary/10 outline-primary/25 focus-visible:outline-3 focus-visible:ring-primary"
		},
		{
			color: "secondary",
			variant: "subtle",
			class: "text-secondary ring ring-inset ring-secondary/25 bg-secondary/10 hover:bg-secondary/15 active:bg-secondary/15 disabled:bg-secondary/10 aria-disabled:bg-secondary/10 outline-secondary/25 focus-visible:outline-3 focus-visible:ring-secondary"
		},
		{
			color: "success",
			variant: "subtle",
			class: "text-success ring ring-inset ring-success/25 bg-success/10 hover:bg-success/15 active:bg-success/15 disabled:bg-success/10 aria-disabled:bg-success/10 outline-success/25 focus-visible:outline-3 focus-visible:ring-success"
		},
		{
			color: "info",
			variant: "subtle",
			class: "text-info ring ring-inset ring-info/25 bg-info/10 hover:bg-info/15 active:bg-info/15 disabled:bg-info/10 aria-disabled:bg-info/10 outline-info/25 focus-visible:outline-3 focus-visible:ring-info"
		},
		{
			color: "warning",
			variant: "subtle",
			class: "text-warning ring ring-inset ring-warning/25 bg-warning/10 hover:bg-warning/15 active:bg-warning/15 disabled:bg-warning/10 aria-disabled:bg-warning/10 outline-warning/25 focus-visible:outline-3 focus-visible:ring-warning"
		},
		{
			color: "error",
			variant: "subtle",
			class: "text-error ring ring-inset ring-error/25 bg-error/10 hover:bg-error/15 active:bg-error/15 disabled:bg-error/10 aria-disabled:bg-error/10 outline-error/25 focus-visible:outline-3 focus-visible:ring-error"
		},
		{
			color: "primary",
			variant: "ghost",
			class: "text-primary hover:bg-primary/10 active:bg-primary/10 outline-primary/25 focus-visible:outline-3 disabled:bg-transparent aria-disabled:bg-transparent dark:disabled:bg-transparent dark:aria-disabled:bg-transparent"
		},
		{
			color: "secondary",
			variant: "ghost",
			class: "text-secondary hover:bg-secondary/10 active:bg-secondary/10 outline-secondary/25 focus-visible:outline-3 disabled:bg-transparent aria-disabled:bg-transparent dark:disabled:bg-transparent dark:aria-disabled:bg-transparent"
		},
		{
			color: "success",
			variant: "ghost",
			class: "text-success hover:bg-success/10 active:bg-success/10 outline-success/25 focus-visible:outline-3 disabled:bg-transparent aria-disabled:bg-transparent dark:disabled:bg-transparent dark:aria-disabled:bg-transparent"
		},
		{
			color: "info",
			variant: "ghost",
			class: "text-info hover:bg-info/10 active:bg-info/10 outline-info/25 focus-visible:outline-3 disabled:bg-transparent aria-disabled:bg-transparent dark:disabled:bg-transparent dark:aria-disabled:bg-transparent"
		},
		{
			color: "warning",
			variant: "ghost",
			class: "text-warning hover:bg-warning/10 active:bg-warning/10 outline-warning/25 focus-visible:outline-3 disabled:bg-transparent aria-disabled:bg-transparent dark:disabled:bg-transparent dark:aria-disabled:bg-transparent"
		},
		{
			color: "error",
			variant: "ghost",
			class: "text-error hover:bg-error/10 active:bg-error/10 outline-error/25 focus-visible:outline-3 disabled:bg-transparent aria-disabled:bg-transparent dark:disabled:bg-transparent dark:aria-disabled:bg-transparent"
		},
		{
			color: "primary",
			variant: "link",
			class: "text-primary hover:text-primary/75 active:text-primary/75 disabled:text-primary aria-disabled:text-primary outline-primary/25 focus-visible:outline-3"
		},
		{
			color: "secondary",
			variant: "link",
			class: "text-secondary hover:text-secondary/75 active:text-secondary/75 disabled:text-secondary aria-disabled:text-secondary outline-secondary/25 focus-visible:outline-3"
		},
		{
			color: "success",
			variant: "link",
			class: "text-success hover:text-success/75 active:text-success/75 disabled:text-success aria-disabled:text-success outline-success/25 focus-visible:outline-3"
		},
		{
			color: "info",
			variant: "link",
			class: "text-info hover:text-info/75 active:text-info/75 disabled:text-info aria-disabled:text-info outline-info/25 focus-visible:outline-3"
		},
		{
			color: "warning",
			variant: "link",
			class: "text-warning hover:text-warning/75 active:text-warning/75 disabled:text-warning aria-disabled:text-warning outline-warning/25 focus-visible:outline-3"
		},
		{
			color: "error",
			variant: "link",
			class: "text-error hover:text-error/75 active:text-error/75 disabled:text-error aria-disabled:text-error outline-error/25 focus-visible:outline-3"
		},
		{
			color: "neutral",
			variant: "solid",
			class: "text-inverted bg-inverted hover:bg-inverted/90 active:bg-inverted/90 disabled:bg-inverted aria-disabled:bg-inverted outline-inverted/25 focus-visible:outline-3"
		},
		{
			color: "neutral",
			variant: "outline",
			class: "ring ring-inset ring-accented text-default bg-default hover:bg-elevated active:bg-elevated disabled:bg-default aria-disabled:bg-default outline-inverted/25 focus-visible:outline-3 focus-visible:ring-inverted"
		},
		{
			color: "neutral",
			variant: "soft",
			class: "text-default bg-elevated hover:bg-accented/75 active:bg-accented/75 outline-inverted/25 focus-visible:outline-3 disabled:bg-elevated aria-disabled:bg-elevated"
		},
		{
			color: "neutral",
			variant: "subtle",
			class: "ring ring-inset ring-accented text-default bg-elevated hover:bg-accented/75 active:bg-accented/75 disabled:bg-elevated aria-disabled:bg-elevated outline-inverted/25 focus-visible:outline-3 focus-visible:ring-inverted"
		},
		{
			color: "neutral",
			variant: "ghost",
			class: "text-default hover:bg-elevated active:bg-elevated outline-inverted/25 focus-visible:outline-3 hover:disabled:bg-transparent dark:hover:disabled:bg-transparent hover:aria-disabled:bg-transparent dark:hover:aria-disabled:bg-transparent"
		},
		{
			color: "neutral",
			variant: "link",
			class: "text-muted hover:text-default active:text-default disabled:text-muted aria-disabled:text-muted outline-inverted/25 focus-visible:outline-3"
		},
		{
			size: "xs",
			square: !0,
			class: "p-1"
		},
		{
			size: "sm",
			square: !0,
			class: "p-1.5"
		},
		{
			size: "md",
			square: !0,
			class: "p-1.5"
		},
		{
			size: "lg",
			square: !0,
			class: "p-2"
		},
		{
			size: "xl",
			square: !0,
			class: "p-2"
		},
		{
			loading: !0,
			leading: !0,
			class: { leadingIcon: "animate-spin" }
		},
		{
			loading: !0,
			leading: !1,
			trailing: !0,
			class: { trailingIcon: "animate-spin" }
		}
	],
	defaultVariants: {
		color: "primary",
		variant: "solid",
		size: "md"
	}
}, bm = {
	__name: "Button",
	props: {
		label: {
			type: String,
			required: !1
		},
		color: {
			type: null,
			required: !1
		},
		activeColor: {
			type: null,
			required: !1
		},
		variant: {
			type: null,
			required: !1
		},
		activeVariant: {
			type: null,
			required: !1
		},
		size: {
			type: null,
			required: !1
		},
		square: {
			type: Boolean,
			required: !1
		},
		block: {
			type: Boolean,
			required: !1
		},
		loadingAuto: {
			type: Boolean,
			required: !1
		},
		onClick: {
			type: [Function, Array],
			required: !1
		},
		class: {
			type: null,
			required: !1
		},
		ui: {
			type: Object,
			required: !1
		},
		icon: {
			type: null,
			required: !1
		},
		avatar: {
			type: Object,
			required: !1
		},
		leading: {
			type: Boolean,
			required: !1
		},
		leadingIcon: {
			type: null,
			required: !1
		},
		trailing: {
			type: Boolean,
			required: !1
		},
		trailingIcon: {
			type: null,
			required: !1
		},
		loading: {
			type: Boolean,
			required: !1
		},
		loadingIcon: {
			type: null,
			required: !1
		},
		as: {
			type: null,
			required: !1
		},
		type: {
			type: null,
			required: !1
		},
		disabled: {
			type: Boolean,
			required: !1
		},
		active: {
			type: Boolean,
			required: !1
		},
		exact: {
			type: Boolean,
			required: !1
		},
		exactQuery: {
			type: [Boolean, String],
			required: !1
		},
		exactHash: {
			type: Boolean,
			required: !1
		},
		inactiveClass: {
			type: String,
			required: !1
		},
		locale: {
			type: [Boolean, String],
			required: !1
		},
		to: {
			type: null,
			required: !1
		},
		href: {
			type: null,
			required: !1
		},
		external: {
			type: Boolean,
			required: !1
		},
		target: {
			type: [
				String,
				Object,
				null
			],
			required: !1
		},
		rel: {
			type: [
				String,
				Object,
				null
			],
			required: !1
		},
		noRel: {
			type: Boolean,
			required: !1
		},
		prefetchedClass: {
			type: String,
			required: !1
		},
		prefetch: {
			type: Boolean,
			required: !1
		},
		prefetchOn: {
			type: [String, Object],
			required: !1
		},
		noPrefetch: {
			type: Boolean,
			required: !1
		},
		trailingSlash: {
			type: String,
			required: !1
		},
		activeClass: {
			type: String,
			required: !1
		},
		exactActiveClass: {
			type: String,
			required: !1
		},
		ariaCurrentValue: {
			type: String,
			required: !1
		},
		viewTransition: {
			type: Boolean,
			required: !1
		},
		replace: {
			type: Boolean,
			required: !1
		}
	},
	setup(e) {
		let t = e, n = ei(), r = nu("button", t), i = bc(), { orientation: a, size: o } = ou(t), s = ru(Sf(r)), c = /* @__PURE__ */ I(!1), l = Wn(fu, void 0);
		async function u(e) {
			c.value = !0;
			let t = Array.isArray(r.onClick) ? r.onClick : [r.onClick];
			try {
				await Promise.all(t.map((t) => t?.(e)));
			} finally {
				c.value = !1;
			}
		}
		let d = X(() => r.loading || r.loadingAuto && (c.value || l?.value && r.type === "submit")), { isLeading: f, isTrailing: p, leadingIconName: m, trailingIconName: h } = iu(X(() => ({
			...r,
			loading: d.value
		}))), g = X(() => bf({
			extend: bf(ym),
			...rs({ variants: { active: {
				true: { base: kc(i.ui?.button?.variants?.active?.true?.base, r.activeClass) },
				false: { base: kc(i.ui?.button?.variants?.active?.false?.base, r.inactiveClass) }
			} } }, i.ui?.button || {})
		})({
			color: r.color,
			variant: r.variant,
			size: o.value ?? r.size,
			loading: d.value,
			block: r.block,
			square: r.square || !n.default && !r.label,
			leading: f.value,
			trailing: p.value,
			fieldGroup: a.value
		}));
		return (e, t) => (H(), W(vm, Y({
			type: L(r).type,
			disabled: L(r).disabled || d.value
		}, L(Ec)(L(s), [
			"type",
			"disabled",
			"onClick"
		]), { custom: "" }), {
			default: R(({ active: t, ...n }) => [K(gm, Y(n, {
				"data-slot": "base",
				class: g.value.base({
					class: [L(r).ui?.base, L(r).class],
					active: t,
					...t && L(r).activeVariant ? { variant: L(r).activeVariant } : {},
					...t && L(r).activeColor ? { color: L(r).activeColor } : {}
				}),
				onClick: u
			}), {
				default: R(() => [
					B(e.$slots, "leading", { ui: g.value }, () => [L(f) && L(m) ? (H(), W(lm, {
						key: 0,
						name: L(m),
						"data-slot": "leadingIcon",
						class: A(g.value.leadingIcon({
							class: L(r).ui?.leadingIcon,
							active: t
						}))
					}, null, 8, ["name", "class"])) : L(r).avatar ? (H(), W(hm, Y({
						key: 1,
						size: L(r).ui?.leadingAvatarSize || g.value.leadingAvatarSize()
					}, L(r).avatar, {
						"data-slot": "leadingAvatar",
						class: g.value.leadingAvatar({
							class: L(r).ui?.leadingAvatar,
							active: t
						})
					}), null, 16, ["size", "class"])) : J("", !0)]),
					B(e.$slots, "default", { ui: g.value }, () => [L(r).label !== void 0 && L(r).label !== null ? (H(), U("span", {
						key: 0,
						"data-slot": "label",
						class: A(g.value.label({
							class: L(r).ui?.label,
							active: t
						}))
					}, M(L(r).label), 3)) : J("", !0)]),
					B(e.$slots, "trailing", { ui: g.value }, () => [L(p) && L(h) ? (H(), W(lm, {
						key: 0,
						name: L(h),
						"data-slot": "trailingIcon",
						class: A(g.value.trailingIcon({
							class: L(r).ui?.trailingIcon,
							active: t
						}))
					}, null, 8, ["name", "class"])) : J("", !0)])
				]),
				_: 2
			}, 1040, ["class"])]),
			_: 3
		}, 16, ["type", "disabled"]));
	}
};
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/unhead@2.1.15/node_modules/unhead/dist/client.mjs
async function xm(e, t = {}) {
	let n = t.document || e.resolvedOptions.document;
	if (!n || !e.dirty) return;
	let r = {
		shouldRender: !0,
		tags: []
	};
	if (await e.hooks.callHook("dom:beforeRender", r), r.shouldRender) return e._domUpdatePromise ||= new Promise(async (t) => {
		let r = /* @__PURE__ */ new Map(), i = new Promise((t) => {
			e.resolveTags().then((e) => {
				t(e.map((e) => {
					let t = r.get(e._d) || 0, n = {
						tag: e,
						id: (t ? `${e._d}:${t}` : e._d) || e._h,
						shouldRender: !0
					};
					return e._d && Xs(e._d) && r.set(e._d, t + 1), n;
				}));
			});
		}), a = e._dom;
		if (!a) {
			a = {
				title: n.title,
				elMap: (/* @__PURE__ */ new Map()).set("htmlAttrs", n.documentElement).set("bodyAttrs", n.body)
			};
			for (let e of ["body", "head"]) {
				let t = n[e]?.children;
				for (let e of t) {
					let t = e.tagName.toLowerCase();
					if (!Hs.has(t)) continue;
					let n = tc({
						tag: t,
						props: {}
					}, {
						innerHTML: e.innerHTML,
						...e.getAttributeNames().reduce((t, n) => (t[n] = e.getAttribute(n), t), {}) || {}
					});
					if (n.key = e.getAttribute("data-hid") || void 0, n._d = Zs(n) || Qs(n), a.elMap.has(n._d)) {
						let t = 1, r = n._d;
						for (; a.elMap.has(r);) r = `${n._d}:${t++}`;
						a.elMap.set(r, e);
					} else a.elMap.set(n._d, e);
				}
			}
		}
		a.pendingSideEffects = { ...a.sideEffects }, a.sideEffects = {};
		function o(e, t, n) {
			let r = `${e}:${t}`;
			a.sideEffects[r] = n, delete a.pendingSideEffects[r];
		}
		function s({ id: e, $el: t, tag: r }) {
			let i = r.tag.endsWith("Attrs");
			a.elMap.set(e, t), i || (r.textContent && r.textContent !== t.textContent && (t.textContent = r.textContent), r.innerHTML && r.innerHTML !== t.innerHTML && (t.innerHTML = r.innerHTML), o(e, "el", () => {
				t?.remove(), a.elMap.delete(e);
			}));
			for (let a in r.props) {
				if (!Object.prototype.hasOwnProperty.call(r.props, a)) continue;
				let s = r.props[a];
				if (a.startsWith("on") && typeof s == "function") {
					let e = t?.dataset;
					if (e && e[`${a}fired`]) {
						let e = a.slice(0, -5);
						s.call(t, new Event(e.substring(2)));
					}
					t.getAttribute(`data-${a}`) !== "" && ((r.tag === "bodyAttrs" ? n.defaultView : t).addEventListener(a.substring(2), s.bind(t)), t.setAttribute(`data-${a}`, ""));
					continue;
				}
				let c = `attr:${a}`;
				if (a === "class") {
					if (!s) continue;
					for (let n of s) i && o(e, `${c}:${n}`, () => t.classList.remove(n)), !t.classList.contains(n) && t.classList.add(n);
				} else if (a === "style") {
					if (!s) continue;
					for (let [n, r] of s) o(e, `${c}:${n}`, () => {
						t.style.removeProperty(n);
					}), t.style.setProperty(n, r);
				} else s !== !1 && s !== null && (t.getAttribute(a) !== s && t.setAttribute(a, s === !0 ? "" : String(s)), i && o(e, c, () => t.removeAttribute(a)));
			}
		}
		let c = [], l = {
			bodyClose: void 0,
			bodyOpen: void 0,
			head: void 0
		}, u = await i;
		for (let e of u) {
			let { tag: t, shouldRender: r, id: i } = e;
			if (r) {
				if (t.tag === "title") {
					n.title = t.textContent, o("title", "", () => n.title = a.title);
					continue;
				}
				e.$el = e.$el || a.elMap.get(i), e.$el ? s(e) : Hs.has(t.tag) && c.push(e);
			}
		}
		for (let e of c) {
			let t = e.tag.tagPosition || "head";
			e.$el = n.createElement(e.tag.tag), s(e), l[t] = l[t] || n.createDocumentFragment(), l[t].appendChild(e.$el);
		}
		for (let t of u) await e.hooks.callHook("dom:renderTag", t, n, o);
		l.head && n.head.appendChild(l.head), l.bodyOpen && n.body.insertBefore(l.bodyOpen, n.body.firstChild), l.bodyClose && n.body.appendChild(l.bodyClose);
		for (let e in a.pendingSideEffects) a.pendingSideEffects[e]();
		e._dom = a, await e.hooks.callHook("dom:rendered", { renders: u }), t();
	}).finally(() => {
		e._domUpdatePromise = void 0, e.dirty = !1;
	}), e._domUpdatePromise;
}
function Sm(e = {}) {
	let t = e.domOptions?.render || xm;
	e.document = e.document || (typeof window < "u" ? document : void 0);
	let n = e.document?.head.querySelector("script[id=\"unhead:payload\"]")?.innerHTML || !1;
	return /* @__PURE__ */ fc({
		...e,
		plugins: [...e.plugins || [], {
			key: "client",
			hooks: { "entries:updated": t }
		}],
		init: [n ? JSON.parse(n) : !1, ...e.init || []]
	});
}
function Cm(e, t) {
	let n = 0;
	return () => {
		let r = ++n;
		t(() => {
			n === r && e();
		});
	};
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/@unhead+vue@2.1.15_vue@3.5.41_typescript@5.9.3_/node_modules/@unhead/vue/dist/client.mjs
// @__NO_SIDE_EFFECTS__
function wm(e = {}) {
	let t = Sm({
		domOptions: { render: Cm(() => xm(t), (e) => setTimeout(e, 0)) },
		...e
	});
	return t.install = /* @__PURE__ */ hc(t), t;
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/@nuxt+ui@4.9.0_patch_hash=4ccf9386c7cac79ac933037f07f03c58e3649f1cf82050f5b2514226e1e46_6210cc9a3324cad860a299c7c3e3caac/node_modules/@nuxt/ui/dist/runtime/vue/plugins/head.js
var Tm = { install(e) {
	if (e._context.provides.usehead) return;
	let t = /* @__PURE__ */ wm();
	e.use(t);
} }, Em = { install(e, t) {
	t?.router && typeof t.router == "function" && e.provide("nuxtui:router", t.router);
} }, Dm = {
	inherit: "inherit",
	current: "currentcolor",
	transparent: "transparent",
	black: "#000",
	white: "#fff",
	slate: {
		50: "oklch(98.4% 0.003 247.858)",
		100: "oklch(96.8% 0.007 247.896)",
		200: "oklch(92.9% 0.013 255.508)",
		300: "oklch(86.9% 0.022 252.894)",
		400: "oklch(70.4% 0.04 256.788)",
		500: "oklch(55.4% 0.046 257.417)",
		600: "oklch(44.6% 0.043 257.281)",
		700: "oklch(37.2% 0.044 257.287)",
		800: "oklch(27.9% 0.041 260.031)",
		900: "oklch(20.8% 0.042 265.755)",
		950: "oklch(12.9% 0.042 264.695)"
	},
	gray: {
		50: "oklch(98.5% 0.002 247.839)",
		100: "oklch(96.7% 0.003 264.542)",
		200: "oklch(92.8% 0.006 264.531)",
		300: "oklch(87.2% 0.01 258.338)",
		400: "oklch(70.7% 0.022 261.325)",
		500: "oklch(55.1% 0.027 264.364)",
		600: "oklch(44.6% 0.03 256.802)",
		700: "oklch(37.3% 0.034 259.733)",
		800: "oklch(27.8% 0.033 256.848)",
		900: "oklch(21% 0.034 264.665)",
		950: "oklch(13% 0.028 261.692)"
	},
	zinc: {
		50: "oklch(98.5% 0 0)",
		100: "oklch(96.7% 0.001 286.375)",
		200: "oklch(92% 0.004 286.32)",
		300: "oklch(87.1% 0.006 286.286)",
		400: "oklch(70.5% 0.015 286.067)",
		500: "oklch(55.2% 0.016 285.938)",
		600: "oklch(44.2% 0.017 285.786)",
		700: "oklch(37% 0.013 285.805)",
		800: "oklch(27.4% 0.006 286.033)",
		900: "oklch(21% 0.006 285.885)",
		950: "oklch(14.1% 0.005 285.823)"
	},
	neutral: {
		50: "oklch(98.5% 0 0)",
		100: "oklch(97% 0 0)",
		200: "oklch(92.2% 0 0)",
		300: "oklch(87% 0 0)",
		400: "oklch(70.8% 0 0)",
		500: "oklch(55.6% 0 0)",
		600: "oklch(43.9% 0 0)",
		700: "oklch(37.1% 0 0)",
		800: "oklch(26.9% 0 0)",
		900: "oklch(20.5% 0 0)",
		950: "oklch(14.5% 0 0)"
	},
	stone: {
		50: "oklch(98.5% 0.001 106.423)",
		100: "oklch(97% 0.001 106.424)",
		200: "oklch(92.3% 0.003 48.717)",
		300: "oklch(86.9% 0.005 56.366)",
		400: "oklch(70.9% 0.01 56.259)",
		500: "oklch(55.3% 0.013 58.071)",
		600: "oklch(44.4% 0.011 73.639)",
		700: "oklch(37.4% 0.01 67.558)",
		800: "oklch(26.8% 0.007 34.298)",
		900: "oklch(21.6% 0.006 56.043)",
		950: "oklch(14.7% 0.004 49.25)"
	},
	mauve: {
		50: "oklch(98.5% 0 0)",
		100: "oklch(96% 0.003 325.6)",
		200: "oklch(92.2% 0.005 325.62)",
		300: "oklch(86.5% 0.012 325.68)",
		400: "oklch(71.1% 0.019 323.02)",
		500: "oklch(54.2% 0.034 322.5)",
		600: "oklch(43.5% 0.029 321.78)",
		700: "oklch(36.4% 0.029 323.89)",
		800: "oklch(26.3% 0.024 320.12)",
		900: "oklch(21.2% 0.019 322.12)",
		950: "oklch(14.5% 0.008 326)"
	},
	olive: {
		50: "oklch(98.8% 0.003 106.5)",
		100: "oklch(96.6% 0.005 106.5)",
		200: "oklch(93% 0.007 106.5)",
		300: "oklch(88% 0.011 106.6)",
		400: "oklch(73.7% 0.021 106.9)",
		500: "oklch(58% 0.031 107.3)",
		600: "oklch(46.6% 0.025 107.3)",
		700: "oklch(39.4% 0.023 107.4)",
		800: "oklch(28.6% 0.016 107.4)",
		900: "oklch(22.8% 0.013 107.4)",
		950: "oklch(15.3% 0.006 107.1)"
	},
	mist: {
		50: "oklch(98.7% 0.002 197.1)",
		100: "oklch(96.3% 0.002 197.1)",
		200: "oklch(92.5% 0.005 214.3)",
		300: "oklch(87.2% 0.007 219.6)",
		400: "oklch(72.3% 0.014 214.4)",
		500: "oklch(56% 0.021 213.5)",
		600: "oklch(45% 0.017 213.2)",
		700: "oklch(37.8% 0.015 216)",
		800: "oklch(27.5% 0.011 216.9)",
		900: "oklch(21.8% 0.008 223.9)",
		950: "oklch(14.8% 0.004 228.8)"
	},
	taupe: {
		50: "oklch(98.6% 0.002 67.8)",
		100: "oklch(96% 0.002 17.2)",
		200: "oklch(92.2% 0.005 34.3)",
		300: "oklch(86.8% 0.007 39.5)",
		400: "oklch(71.4% 0.014 41.2)",
		500: "oklch(54.7% 0.021 43.1)",
		600: "oklch(43.8% 0.017 39.3)",
		700: "oklch(36.7% 0.016 35.7)",
		800: "oklch(26.8% 0.011 36.5)",
		900: "oklch(21.4% 0.009 43.1)",
		950: "oklch(14.7% 0.004 49.3)"
	},
	red: {
		50: "oklch(97.1% 0.013 17.38)",
		100: "oklch(93.6% 0.032 17.717)",
		200: "oklch(88.5% 0.062 18.334)",
		300: "oklch(80.8% 0.114 19.571)",
		400: "oklch(70.4% 0.191 22.216)",
		500: "oklch(63.7% 0.237 25.331)",
		600: "oklch(57.7% 0.245 27.325)",
		700: "oklch(50.5% 0.213 27.518)",
		800: "oklch(44.4% 0.177 26.899)",
		900: "oklch(39.6% 0.141 25.723)",
		950: "oklch(25.8% 0.092 26.042)"
	},
	orange: {
		50: "oklch(98% 0.016 73.684)",
		100: "oklch(95.4% 0.038 75.164)",
		200: "oklch(90.1% 0.076 70.697)",
		300: "oklch(83.7% 0.128 66.29)",
		400: "oklch(75% 0.183 55.934)",
		500: "oklch(70.5% 0.213 47.604)",
		600: "oklch(64.6% 0.222 41.116)",
		700: "oklch(55.3% 0.195 38.402)",
		800: "oklch(47% 0.157 37.304)",
		900: "oklch(40.8% 0.123 38.172)",
		950: "oklch(26.6% 0.079 36.259)"
	},
	amber: {
		50: "oklch(98.7% 0.022 95.277)",
		100: "oklch(96.2% 0.059 95.617)",
		200: "oklch(92.4% 0.12 95.746)",
		300: "oklch(87.9% 0.169 91.605)",
		400: "oklch(82.8% 0.189 84.429)",
		500: "oklch(76.9% 0.188 70.08)",
		600: "oklch(66.6% 0.179 58.318)",
		700: "oklch(55.5% 0.163 48.998)",
		800: "oklch(47.3% 0.137 46.201)",
		900: "oklch(41.4% 0.112 45.904)",
		950: "oklch(27.9% 0.077 45.635)"
	},
	yellow: {
		50: "oklch(98.7% 0.026 102.212)",
		100: "oklch(97.3% 0.071 103.193)",
		200: "oklch(94.5% 0.129 101.54)",
		300: "oklch(90.5% 0.182 98.111)",
		400: "oklch(85.2% 0.199 91.936)",
		500: "oklch(79.5% 0.184 86.047)",
		600: "oklch(68.1% 0.162 75.834)",
		700: "oklch(55.4% 0.135 66.442)",
		800: "oklch(47.6% 0.114 61.907)",
		900: "oklch(42.1% 0.095 57.708)",
		950: "oklch(28.6% 0.066 53.813)"
	},
	lime: {
		50: "oklch(98.6% 0.031 120.757)",
		100: "oklch(96.7% 0.067 122.328)",
		200: "oklch(93.8% 0.127 124.321)",
		300: "oklch(89.7% 0.196 126.665)",
		400: "oklch(84.1% 0.238 128.85)",
		500: "oklch(76.8% 0.233 130.85)",
		600: "oklch(64.8% 0.2 131.684)",
		700: "oklch(53.2% 0.157 131.589)",
		800: "oklch(45.3% 0.124 130.933)",
		900: "oklch(40.5% 0.101 131.063)",
		950: "oklch(27.4% 0.072 132.109)"
	},
	green: {
		50: "oklch(98.2% 0.018 155.826)",
		100: "oklch(96.2% 0.044 156.743)",
		200: "oklch(92.5% 0.084 155.995)",
		300: "oklch(87.1% 0.15 154.449)",
		400: "oklch(79.2% 0.209 151.711)",
		500: "oklch(72.3% 0.219 149.579)",
		600: "oklch(62.7% 0.194 149.214)",
		700: "oklch(52.7% 0.154 150.069)",
		800: "oklch(44.8% 0.119 151.328)",
		900: "oklch(39.3% 0.095 152.535)",
		950: "oklch(26.6% 0.065 152.934)"
	},
	emerald: {
		50: "oklch(97.9% 0.021 166.113)",
		100: "oklch(95% 0.052 163.051)",
		200: "oklch(90.5% 0.093 164.15)",
		300: "oklch(84.5% 0.143 164.978)",
		400: "oklch(76.5% 0.177 163.223)",
		500: "oklch(69.6% 0.17 162.48)",
		600: "oklch(59.6% 0.145 163.225)",
		700: "oklch(50.8% 0.118 165.612)",
		800: "oklch(43.2% 0.095 166.913)",
		900: "oklch(37.8% 0.077 168.94)",
		950: "oklch(26.2% 0.051 172.552)"
	},
	teal: {
		50: "oklch(98.4% 0.014 180.72)",
		100: "oklch(95.3% 0.051 180.801)",
		200: "oklch(91% 0.096 180.426)",
		300: "oklch(85.5% 0.138 181.071)",
		400: "oklch(77.7% 0.152 181.912)",
		500: "oklch(70.4% 0.14 182.503)",
		600: "oklch(60% 0.118 184.704)",
		700: "oklch(51.1% 0.096 186.391)",
		800: "oklch(43.7% 0.078 188.216)",
		900: "oklch(38.6% 0.063 188.416)",
		950: "oklch(27.7% 0.046 192.524)"
	},
	cyan: {
		50: "oklch(98.4% 0.019 200.873)",
		100: "oklch(95.6% 0.045 203.388)",
		200: "oklch(91.7% 0.08 205.041)",
		300: "oklch(86.5% 0.127 207.078)",
		400: "oklch(78.9% 0.154 211.53)",
		500: "oklch(71.5% 0.143 215.221)",
		600: "oklch(60.9% 0.126 221.723)",
		700: "oklch(52% 0.105 223.128)",
		800: "oklch(45% 0.085 224.283)",
		900: "oklch(39.8% 0.07 227.392)",
		950: "oklch(30.2% 0.056 229.695)"
	},
	sky: {
		50: "oklch(97.7% 0.013 236.62)",
		100: "oklch(95.1% 0.026 236.824)",
		200: "oklch(90.1% 0.058 230.902)",
		300: "oklch(82.8% 0.111 230.318)",
		400: "oklch(74.6% 0.16 232.661)",
		500: "oklch(68.5% 0.169 237.323)",
		600: "oklch(58.8% 0.158 241.966)",
		700: "oklch(50% 0.134 242.749)",
		800: "oklch(44.3% 0.11 240.79)",
		900: "oklch(39.1% 0.09 240.876)",
		950: "oklch(29.3% 0.066 243.157)"
	},
	blue: {
		50: "oklch(97% 0.014 254.604)",
		100: "oklch(93.2% 0.032 255.585)",
		200: "oklch(88.2% 0.059 254.128)",
		300: "oklch(80.9% 0.105 251.813)",
		400: "oklch(70.7% 0.165 254.624)",
		500: "oklch(62.3% 0.214 259.815)",
		600: "oklch(54.6% 0.245 262.881)",
		700: "oklch(48.8% 0.243 264.376)",
		800: "oklch(42.4% 0.199 265.638)",
		900: "oklch(37.9% 0.146 265.522)",
		950: "oklch(28.2% 0.091 267.935)"
	},
	indigo: {
		50: "oklch(96.2% 0.018 272.314)",
		100: "oklch(93% 0.034 272.788)",
		200: "oklch(87% 0.065 274.039)",
		300: "oklch(78.5% 0.115 274.713)",
		400: "oklch(67.3% 0.182 276.935)",
		500: "oklch(58.5% 0.233 277.117)",
		600: "oklch(51.1% 0.262 276.966)",
		700: "oklch(45.7% 0.24 277.023)",
		800: "oklch(39.8% 0.195 277.366)",
		900: "oklch(35.9% 0.144 278.697)",
		950: "oklch(25.7% 0.09 281.288)"
	},
	violet: {
		50: "oklch(96.9% 0.016 293.756)",
		100: "oklch(94.3% 0.029 294.588)",
		200: "oklch(89.4% 0.057 293.283)",
		300: "oklch(81.1% 0.111 293.571)",
		400: "oklch(70.2% 0.183 293.541)",
		500: "oklch(60.6% 0.25 292.717)",
		600: "oklch(54.1% 0.281 293.009)",
		700: "oklch(49.1% 0.27 292.581)",
		800: "oklch(43.2% 0.232 292.759)",
		900: "oklch(38% 0.189 293.745)",
		950: "oklch(28.3% 0.141 291.089)"
	},
	purple: {
		50: "oklch(97.7% 0.014 308.299)",
		100: "oklch(94.6% 0.033 307.174)",
		200: "oklch(90.2% 0.063 306.703)",
		300: "oklch(82.7% 0.119 306.383)",
		400: "oklch(71.4% 0.203 305.504)",
		500: "oklch(62.7% 0.265 303.9)",
		600: "oklch(55.8% 0.288 302.321)",
		700: "oklch(49.6% 0.265 301.924)",
		800: "oklch(43.8% 0.218 303.724)",
		900: "oklch(38.1% 0.176 304.987)",
		950: "oklch(29.1% 0.149 302.717)"
	},
	fuchsia: {
		50: "oklch(97.7% 0.017 320.058)",
		100: "oklch(95.2% 0.037 318.852)",
		200: "oklch(90.3% 0.076 319.62)",
		300: "oklch(83.3% 0.145 321.434)",
		400: "oklch(74% 0.238 322.16)",
		500: "oklch(66.7% 0.295 322.15)",
		600: "oklch(59.1% 0.293 322.896)",
		700: "oklch(51.8% 0.253 323.949)",
		800: "oklch(45.2% 0.211 324.591)",
		900: "oklch(40.1% 0.17 325.612)",
		950: "oklch(29.3% 0.136 325.661)"
	},
	pink: {
		50: "oklch(97.1% 0.014 343.198)",
		100: "oklch(94.8% 0.028 342.258)",
		200: "oklch(89.9% 0.061 343.231)",
		300: "oklch(82.3% 0.12 346.018)",
		400: "oklch(71.8% 0.202 349.761)",
		500: "oklch(65.6% 0.241 354.308)",
		600: "oklch(59.2% 0.249 0.584)",
		700: "oklch(52.5% 0.223 3.958)",
		800: "oklch(45.9% 0.187 3.815)",
		900: "oklch(40.8% 0.153 2.432)",
		950: "oklch(28.4% 0.109 3.907)"
	},
	rose: {
		50: "oklch(96.9% 0.015 12.422)",
		100: "oklch(94.1% 0.03 12.58)",
		200: "oklch(89.2% 0.058 10.001)",
		300: "oklch(81% 0.117 11.638)",
		400: "oklch(71.2% 0.194 13.428)",
		500: "oklch(64.5% 0.246 16.439)",
		600: "oklch(58.6% 0.253 17.585)",
		700: "oklch(51.4% 0.222 16.935)",
		800: "oklch(45.5% 0.188 13.697)",
		900: "oklch(41% 0.159 10.272)",
		950: "oklch(27.1% 0.105 12.094)"
	}
}, Om = [
	50,
	100,
	200,
	300,
	400,
	500,
	600,
	700,
	800,
	900,
	950
];
function km(e, t) {
	return e in Dm && typeof Dm[e] == "object" && t in Dm[e] ? Dm[e][t] : "";
}
function Am(e, t, n) {
	let r = n ? `${n}-` : "";
	return `${Om.map((n) => `--ui-color-${e}-${n}: var(--${r}color-${t === "neutral" ? "old-neutral" : t}-${n}, ${km(t, n)});`).join("\n  ")}`;
}
function jm(e, t) {
	return `--ui-${e}: var(--ui-color-${e}-${t});`;
}
function Mm() {
	document.querySelector("[data-nuxt-ui-colors]")?.remove();
}
var Nm = Bc(() => {
	let e = bc(), t = zc(), n = X(() => {
		let { neutral: t, ...n } = e.ui.colors, r = e.ui.prefix;
		return `@layer theme {
  :root, :host {
  ${Object.entries(e.ui.colors).map(([e, t]) => Am(e, t, r)).join("\n  ")}
  }
  :root, :host, .light {
  ${Object.keys(n).map((e) => jm(e, 500)).join("\n  ")}
  }
  .dark {
  ${Object.keys(n).map((e) => jm(e, 400)).join("\n  ")}
  }
}`;
	}), r = { style: [{
		innerHTML: n,
		tagPriority: "critical",
		id: "nuxt-ui-colors"
	}] };
	if (t.isHydrating && !t.payload.serverRendered) {
		let e = document.createElement("style");
		e.innerHTML = n.value, e.setAttribute("data-nuxt-ui-colors", ""), document.head.appendChild(e);
		let t = (/* @__PURE__ */ gc()).hooks.hook("dom:rendered", () => {
			t(), Mm();
		});
	}
	_c(r);
}), Pm = { install(e, t = {}) {
	e.use(Tm, t), e.use(Em, t), e.use(Nm, t);
} }, Fm = Symbol("nuxt-ui.portal-target");
function Im(e) {
	let t = Wn(Fm, void 0), n = X(() => e.value === !0 ? t?.value : e.value), r = X(() => typeof n.value == "boolean" && !n.value), i = X(() => typeof n.value == "boolean" ? "body" : n.value);
	return X(() => ({
		to: i.value,
		disabled: r.value
	}));
}
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/@nuxt+ui@4.9.0_patch_hash=4ccf9386c7cac79ac933037f07f03c58e3649f1cf82050f5b2514226e1e46_6210cc9a3324cad860a299c7c3e3caac/node_modules/@nuxt/ui/dist/runtime/composables/useToast.js
var Lm = Symbol("nuxt-ui.toast-max");
function Rm() {
	let e = Lc("toasts", () => []), t = Wn(Lm, void 0), n = /* @__PURE__ */ I(!1), r = [], i = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
	async function a() {
		if (!(n.value || r.length === 0)) {
			for (n.value = !0; r.length > 0;) {
				let n = r.shift();
				await An(), e.value = [...e.value, n].slice(-(t?.value ?? 5));
			}
			n.value = !1;
		}
	}
	function o(t) {
		let n = {
			id: i(),
			open: !0,
			...t
		}, o = e.value.findIndex((e) => e.id === n.id);
		return o === -1 ? (r.push(n), a(), n) : (e.value[o] = {
			...e.value[o],
			...n,
			_duplicate: (e.value[o]._duplicate || 0) + 1
		}, n);
	}
	function s(t, n) {
		let r = e.value.findIndex((e) => e.id === t);
		r !== -1 && (e.value[r] = {
			...e.value[r],
			...n,
			duration: n.duration,
			open: !0,
			_updated: !0
		}, An(() => {
			let n = e.value.findIndex((e) => e.id === t);
			n !== -1 && e.value[n]._updated && (e.value[n] = {
				...e.value[n],
				_updated: void 0
			});
		}));
	}
	function c(t) {
		let n = e.value.findIndex((e) => e.id === t);
		n !== -1 && e.value[n]._updated || (n !== -1 && (e.value[n] = {
			...e.value[n],
			open: !1
		}), setTimeout(() => {
			e.value = e.value.filter((e) => e.id !== t);
		}, 200));
	}
	function l() {
		e.value = [];
	}
	return {
		toasts: e,
		add: o,
		update: s,
		remove: c,
		clear: l
	};
}
//#endregion
//#region virtual:nuxt-ui-templates/ui/progress.ts
var zm = {
	slots: {
		root: "gap-2",
		base: "relative overflow-hidden rounded-full bg-accented",
		indicator: "rounded-full size-full transition-transform duration-200 ease-out",
		status: "flex text-dimmed transition-[width] duration-200",
		steps: "grid items-end",
		step: "truncate text-end row-start-1 col-start-1 transition-opacity"
	},
	variants: {
		animation: {
			carousel: "",
			"carousel-inverse": "",
			swing: "",
			elastic: ""
		},
		color: {
			primary: {
				indicator: "bg-primary",
				steps: "text-primary"
			},
			secondary: {
				indicator: "bg-secondary",
				steps: "text-secondary"
			},
			success: {
				indicator: "bg-success",
				steps: "text-success"
			},
			info: {
				indicator: "bg-info",
				steps: "text-info"
			},
			warning: {
				indicator: "bg-warning",
				steps: "text-warning"
			},
			error: {
				indicator: "bg-error",
				steps: "text-error"
			},
			neutral: {
				indicator: "bg-inverted",
				steps: "text-inverted"
			}
		},
		size: {
			"2xs": {
				status: "text-xs",
				steps: "text-xs"
			},
			xs: {
				status: "text-xs",
				steps: "text-xs"
			},
			sm: {
				status: "text-sm",
				steps: "text-sm"
			},
			md: {
				status: "text-sm",
				steps: "text-sm"
			},
			lg: {
				status: "text-sm",
				steps: "text-sm"
			},
			xl: {
				status: "text-base",
				steps: "text-base"
			},
			"2xl": {
				status: "text-base",
				steps: "text-base"
			}
		},
		step: {
			active: { step: "opacity-100" },
			first: { step: "opacity-100 text-muted" },
			other: { step: "opacity-0" },
			last: { step: "" }
		},
		orientation: {
			horizontal: {
				root: "w-full flex flex-col",
				base: "w-full",
				status: "flex-row items-center justify-end min-w-fit"
			},
			vertical: {
				root: "h-full flex flex-row-reverse",
				base: "h-full",
				status: "flex-col justify-end min-h-fit"
			}
		},
		inverted: { true: { status: "self-end" } }
	},
	compoundVariants: [
		{
			inverted: !0,
			orientation: "horizontal",
			class: {
				step: "text-start",
				status: "flex-row-reverse"
			}
		},
		{
			inverted: !0,
			orientation: "vertical",
			class: {
				steps: "items-start",
				status: "flex-col-reverse"
			}
		},
		{
			orientation: "horizontal",
			size: "2xs",
			class: "h-px"
		},
		{
			orientation: "horizontal",
			size: "xs",
			class: "h-0.5"
		},
		{
			orientation: "horizontal",
			size: "sm",
			class: "h-1"
		},
		{
			orientation: "horizontal",
			size: "md",
			class: "h-2"
		},
		{
			orientation: "horizontal",
			size: "lg",
			class: "h-3"
		},
		{
			orientation: "horizontal",
			size: "xl",
			class: "h-4"
		},
		{
			orientation: "horizontal",
			size: "2xl",
			class: "h-5"
		},
		{
			orientation: "vertical",
			size: "2xs",
			class: "w-px"
		},
		{
			orientation: "vertical",
			size: "xs",
			class: "w-0.5"
		},
		{
			orientation: "vertical",
			size: "sm",
			class: "w-1"
		},
		{
			orientation: "vertical",
			size: "md",
			class: "w-2"
		},
		{
			orientation: "vertical",
			size: "lg",
			class: "w-3"
		},
		{
			orientation: "vertical",
			size: "xl",
			class: "w-4"
		},
		{
			orientation: "vertical",
			size: "2xl",
			class: "w-5"
		},
		{
			orientation: "horizontal",
			animation: "carousel",
			class: { indicator: "data-[state=indeterminate]:animate-[carousel_2s_ease-in-out_infinite] data-[state=indeterminate]:rtl:animate-[carousel-rtl_2s_ease-in-out_infinite]" }
		},
		{
			orientation: "vertical",
			animation: "carousel",
			class: { indicator: "data-[state=indeterminate]:animate-[carousel-vertical_2s_ease-in-out_infinite]" }
		},
		{
			orientation: "horizontal",
			animation: "carousel-inverse",
			class: { indicator: "data-[state=indeterminate]:animate-[carousel-inverse_2s_ease-in-out_infinite] data-[state=indeterminate]:rtl:animate-[carousel-inverse-rtl_2s_ease-in-out_infinite]" }
		},
		{
			orientation: "vertical",
			animation: "carousel-inverse",
			class: { indicator: "data-[state=indeterminate]:animate-[carousel-inverse-vertical_2s_ease-in-out_infinite]" }
		},
		{
			orientation: "horizontal",
			animation: "swing",
			class: { indicator: "data-[state=indeterminate]:animate-[swing_2s_ease-in-out_infinite]" }
		},
		{
			orientation: "vertical",
			animation: "swing",
			class: { indicator: "data-[state=indeterminate]:animate-[swing-vertical_2s_ease-in-out_infinite]" }
		},
		{
			orientation: "horizontal",
			animation: "elastic",
			class: { indicator: "data-[state=indeterminate]:animate-[elastic_2s_ease-in-out_infinite]" }
		},
		{
			orientation: "vertical",
			animation: "elastic",
			class: { indicator: "data-[state=indeterminate]:animate-[elastic-vertical_2s_ease-in-out_infinite]" }
		}
	],
	defaultVariants: {
		animation: "carousel",
		color: "primary",
		size: "md"
	}
}, Bm = {
	__name: "Progress",
	props: {
		as: {
			type: null,
			required: !1
		},
		max: {
			type: [Number, Array],
			required: !1
		},
		status: {
			type: Boolean,
			required: !1
		},
		inverted: {
			type: Boolean,
			required: !1,
			default: !1
		},
		size: {
			type: null,
			required: !1
		},
		color: {
			type: null,
			required: !1
		},
		orientation: {
			type: null,
			required: !1,
			default: "horizontal"
		},
		animation: {
			type: null,
			required: !1
		},
		class: {
			type: null,
			required: !1
		},
		ui: {
			type: Object,
			required: !1
		},
		getValueLabel: {
			type: Function,
			required: !1
		},
		getValueText: {
			type: Function,
			required: !1
		},
		modelValue: {
			type: [Number, null],
			required: !1,
			default: null
		}
	},
	emits: ["update:modelValue", "update:max"],
	setup(e, { emit: t }) {
		let n = e, r = t, i = ei(), a = nu("progress", n), { dir: o } = Fc(), s = bc(), c = ru(Ts(a, "getValueLabel", "getValueText", "modelValue"), r), l = X(() => c.value.modelValue === null), u = X(() => Array.isArray(a.max)), d = X(() => {
			if (!(l.value || !a.max)) return Array.isArray(a.max) ? a.max.length - 1 : Number(a.max);
		}), f = X(() => {
			if (!l.value) switch (!0) {
				case c.value.modelValue < 0: return 0;
				case c.value.modelValue > (d.value ?? 100): return 100;
				default: return Math.round(c.value.modelValue / (d.value ?? 100) * 100);
			}
		}), p = X(() => {
			if (f.value !== void 0) return a.orientation === "vertical" ? { transform: `translateY(${a.inverted ? "" : "-"}${100 - f.value}%)` } : o.value === "rtl" ? { transform: `translateX(${a.inverted ? "-" : ""}${100 - f.value}%)` } : { transform: `translateX(${a.inverted ? "" : "-"}${100 - f.value}%)` };
		}), m = X(() => {
			let e = `${Math.max(f.value ?? 0, 0)}%`;
			return a.orientation === "vertical" ? { height: e } : { width: e };
		});
		function h(e) {
			return e === Number(a.modelValue);
		}
		function g(e) {
			return e === 0;
		}
		function _(e) {
			return e === d.value;
		}
		function v(e) {
			return e = Number(e), h(e) && !g(e) ? "active" : g(e) && h(e) ? "first" : _(e) && h(e) ? "last" : "other";
		}
		let y = X(() => bf({
			extend: bf(zm),
			...s.ui?.progress || {}
		})({
			animation: a.animation,
			size: a.size,
			color: a.color,
			orientation: a.orientation,
			inverted: a.inverted
		}));
		return (e, t) => (H(), W(L(rl), {
			as: L(a).as,
			"data-orientation": L(a).orientation,
			"data-slot": "root",
			class: A(y.value.root({ class: [L(a).ui?.root, L(a).class] }))
		}, {
			default: R(() => [
				!l.value && (L(a).status || i.status) ? (H(), U("div", {
					key: 0,
					"data-slot": "status",
					class: A(y.value.status({ class: L(a).ui?.status })),
					style: le(m.value)
				}, [B(e.$slots, "status", { percent: f.value }, () => [q(M(f.value) + "% ", 1)])], 6)) : J("", !0),
				K(L(Sl), Y(L(c), {
					max: d.value,
					"data-slot": "base",
					class: y.value.base({ class: L(a).ui?.base }),
					style: { transform: "translateZ(0)" }
				}), {
					default: R(() => [K(L(Cl), {
						"data-slot": "indicator",
						class: A(y.value.indicator({ class: L(a).ui?.indicator })),
						style: le(p.value)
					}, null, 8, ["class", "style"])]),
					_: 1
				}, 16, ["max", "class"]),
				u.value ? (H(), U("div", {
					key: 1,
					"data-slot": "steps",
					class: A(y.value.steps({ class: L(a).ui?.steps }))
				}, [(H(!0), U(V, null, Jr(L(a).max, (t, n) => (H(), U("div", {
					key: n,
					"data-slot": "step",
					class: A(y.value.step({
						class: L(a).ui?.step,
						step: v(n)
					}))
				}, [B(e.$slots, `step-${n}`, { step: t }, () => [q(M(t), 1)])], 2))), 128))], 2)) : J("", !0)
			]),
			_: 3
		}, 8, [
			"as",
			"data-orientation",
			"class"
		]));
	}
}, Vm = {
	slots: {
		root: "relative group overflow-hidden bg-default shadow-lg rounded-lg ring ring-default p-4 flex gap-2.5",
		wrapper: "w-0 flex-1 flex flex-col",
		title: "text-sm font-medium text-highlighted",
		description: "text-sm text-muted",
		icon: "shrink-0 size-5",
		avatar: "shrink-0",
		avatarSize: "2xl",
		actions: "flex gap-1.5 shrink-0",
		progress: "absolute inset-x-0 bottom-0",
		close: "p-0"
	},
	variants: {
		color: {
			primary: {
				root: "outline-primary/25 focus-visible:outline-3 focus-visible:ring-primary",
				icon: "text-primary"
			},
			secondary: {
				root: "outline-secondary/25 focus-visible:outline-3 focus-visible:ring-secondary",
				icon: "text-secondary"
			},
			success: {
				root: "outline-success/25 focus-visible:outline-3 focus-visible:ring-success",
				icon: "text-success"
			},
			info: {
				root: "outline-info/25 focus-visible:outline-3 focus-visible:ring-info",
				icon: "text-info"
			},
			warning: {
				root: "outline-warning/25 focus-visible:outline-3 focus-visible:ring-warning",
				icon: "text-warning"
			},
			error: {
				root: "outline-error/25 focus-visible:outline-3 focus-visible:ring-error",
				icon: "text-error"
			},
			neutral: {
				root: "outline-inverted/25 focus-visible:outline-3 focus-visible:ring-inverted",
				icon: "text-highlighted"
			}
		},
		orientation: {
			horizontal: {
				root: "items-center",
				actions: "items-center"
			},
			vertical: {
				root: "items-start",
				actions: "items-start mt-2.5"
			}
		},
		title: { true: { description: "mt-1" } }
	},
	defaultVariants: { color: "primary" }
}, Hm = {
	__name: "Toast",
	props: {
		as: {
			type: null,
			required: !1
		},
		title: {
			type: [
				String,
				Object,
				Function
			],
			required: !1
		},
		description: {
			type: [
				String,
				Object,
				Function
			],
			required: !1
		},
		icon: {
			type: null,
			required: !1
		},
		avatar: {
			type: Object,
			required: !1
		},
		color: {
			type: null,
			required: !1
		},
		orientation: {
			type: null,
			required: !1,
			default: "vertical"
		},
		close: {
			type: [Boolean, Object],
			required: !1,
			default: !0
		},
		closeIcon: {
			type: null,
			required: !1
		},
		actions: {
			type: Array,
			required: !1
		},
		duration: {
			type: Number,
			required: !1
		},
		progress: {
			type: [Boolean, Object],
			required: !1,
			default: !0
		},
		class: {
			type: null,
			required: !1
		},
		ui: {
			type: Object,
			required: !1
		},
		defaultOpen: {
			type: Boolean,
			required: !1
		},
		open: {
			type: Boolean,
			required: !1
		},
		type: {
			type: String,
			required: !1
		}
	},
	emits: [
		"escapeKeyDown",
		"pause",
		"resume",
		"swipeStart",
		"swipeMove",
		"swipeCancel",
		"swipeEnd",
		"update:open"
	],
	setup(e, { expose: t, emit: n }) {
		let r = e, i = n, a = ei(), o = nu("toast", r), { t: s } = Fc(), c = bc(), l = ru(Ts(o, "as", "defaultOpen", "open", "duration", "type"), i), u = X(() => bf({
			extend: bf(Vm),
			...c.ui?.toast || {}
		})({
			color: o.color,
			orientation: o.orientation,
			title: !!o.title || !!a.title
		})), d = br("rootRef"), f = /* @__PURE__ */ I(0);
		return Pr(() => {
			d.value?.$el?.getBoundingClientRect && (f.value = d.value.$el.getBoundingClientRect().height);
		}), t({ height: f }), (e, t) => (H(), W(L(Hl), Y({
			ref_key: "rootRef",
			ref: d
		}, L(l), {
			"data-orientation": L(o).orientation,
			"data-slot": "root",
			class: u.value.root({ class: [L(o).ui?.root, L(o).class] }),
			style: { "--height": f.value }
		}), {
			default: R(({ remaining: n, duration: r, open: i }) => [
				B(e.$slots, "leading", { ui: u.value }, () => [L(o).avatar ? (H(), W(hm, Y({
					key: 0,
					size: L(o).ui?.avatarSize || u.value.avatarSize()
				}, L(o).avatar, {
					"data-slot": "avatar",
					class: u.value.avatar({ class: L(o).ui?.avatar })
				}), null, 16, ["size", "class"])) : L(o).icon ? (H(), W(lm, {
					key: 1,
					name: L(o).icon,
					"data-slot": "icon",
					class: A(u.value.icon({ class: L(o).ui?.icon }))
				}, null, 8, ["name", "class"])) : J("", !0)]),
				G("div", {
					"data-slot": "wrapper",
					class: A(u.value.wrapper({ class: L(o).ui?.wrapper }))
				}, [
					L(o).title || a.title ? (H(), W(L(Ul), {
						key: 0,
						"data-slot": "title",
						class: A(u.value.title({ class: L(o).ui?.title }))
					}, {
						default: R(() => [B(e.$slots, "title", {}, () => [typeof L(o).title == "function" ? (H(), W(Gr(L(o).title()), { key: 0 })) : typeof L(o).title == "object" ? (H(), W(Gr(L(o).title), { key: 1 })) : (H(), U(V, { key: 2 }, [q(M(L(o).title), 1)], 64))])]),
						_: 3
					}, 8, ["class"])) : J("", !0),
					L(o).description || a.description ? (H(), W(L(Bl), {
						key: 1,
						"data-slot": "description",
						class: A(u.value.description({ class: L(o).ui?.description }))
					}, {
						default: R(() => [B(e.$slots, "description", {}, () => [typeof L(o).description == "function" ? (H(), W(Gr(L(o).description()), { key: 0 })) : typeof L(o).description == "object" ? (H(), W(Gr(L(o).description), { key: 1 })) : (H(), U(V, { key: 2 }, [q(M(L(o).description), 1)], 64))])]),
						_: 3
					}, 8, ["class"])) : J("", !0),
					L(o).orientation === "vertical" && (L(o).actions?.length || a.actions) ? (H(), U("div", {
						key: 2,
						"data-slot": "actions",
						class: A(u.value.actions({ class: L(o).ui?.actions }))
					}, [B(e.$slots, "actions", {}, () => [(H(!0), U(V, null, Jr(L(o).actions, (e, n) => (H(), W(L(zl), {
						key: n,
						"alt-text": e.label || "Action",
						"as-child": "",
						onClick: t[0] ||= Go(() => {}, ["stop"])
					}, {
						default: R(() => [K(bm, Y({
							size: "xs",
							color: L(o).color
						}, { ref_for: !0 }, e), null, 16, ["color"])]),
						_: 2
					}, 1032, ["alt-text"]))), 128))])], 2)) : J("", !0)
				], 2),
				L(o).orientation === "horizontal" && (L(o).actions?.length || a.actions) || L(o).close ? (H(), U("div", {
					key: 0,
					"data-slot": "actions",
					class: A(u.value.actions({
						class: L(o).ui?.actions,
						orientation: "horizontal"
					}))
				}, [L(o).orientation === "horizontal" && (L(o).actions?.length || a.actions) ? B(e.$slots, "actions", {}, () => [(H(!0), U(V, null, Jr(L(o).actions, (e, n) => (H(), W(L(zl), {
					key: n,
					"alt-text": e.label || "Action",
					"as-child": "",
					onClick: t[1] ||= Go(() => {}, ["stop"])
				}, {
					default: R(() => [K(bm, Y({
						size: "xs",
						color: L(o).color
					}, { ref_for: !0 }, e), null, 16, ["color"])]),
					_: 2
				}, 1032, ["alt-text"]))), 128))], void 0, 0) : J("", !0), L(o).close || a.close ? (H(), W(L(Rl), {
					key: 1,
					"as-child": ""
				}, {
					default: R(() => [B(e.$slots, "close", { ui: u.value }, () => [L(o).close ? (H(), W(bm, Y({
						key: 0,
						icon: L(o).closeIcon || L(c).ui.icons.close,
						color: "neutral",
						variant: "link",
						"aria-label": L(s)("toast.close")
					}, typeof L(o).close == "object" ? L(o).close : {}, {
						"data-slot": "close",
						class: u.value.close({ class: L(o).ui?.close }),
						onClick: t[2] ||= Go(() => {}, ["stop"])
					}), null, 16, [
						"icon",
						"aria-label",
						"class"
					])) : J("", !0)])]),
					_: 3
				})) : J("", !0)], 2)) : J("", !0),
				L(o).progress && i && n > 0 && r ? (H(), W(Bm, Y({
					key: 1,
					"model-value": n / r * 100,
					color: L(o).color
				}, typeof L(o).progress == "object" ? L(o).progress : {}, {
					size: "sm",
					"data-slot": "progress",
					class: u.value.progress({ class: L(o).ui?.progress })
				}), null, 16, [
					"model-value",
					"color",
					"class"
				])) : J("", !0)
			]),
			_: 3
		}, 16, [
			"data-orientation",
			"class",
			"style"
		]));
	}
}, Um = {
	slots: {
		viewport: "fixed flex flex-col w-[calc(100%-2rem)] sm:w-96 z-[100] data-[expanded=true]:h-(--height) focus:outline-none",
		base: "pointer-events-auto absolute inset-x-0 z-(--index) transform-(--transform) data-[expanded=false]:data-[front=false]:h-(--front-height) data-[expanded=false]:data-[front=false]:*:opacity-0 data-[front=false]:*:transition-opacity data-[front=false]:*:duration-100 data-[state=closed]:animate-[toast-closed_200ms_ease-in-out] data-[state=closed]:data-[expanded=false]:data-[front=false]:animate-[toast-collapsed-closed_200ms_ease-in-out] data-[state=open]:data-[pulsing=odd]:animate-[toast-pulse-a_300ms_ease-out] data-[state=open]:data-[pulsing=even]:animate-[toast-pulse-b_300ms_ease-out] data-[swipe=move]:transition-none transition-[transform,translate,height] duration-200 ease-out"
	},
	variants: {
		position: {
			"top-left": { viewport: "left-4" },
			"top-center": { viewport: "left-1/2 transform -translate-x-1/2" },
			"top-right": { viewport: "right-4" },
			"bottom-left": { viewport: "left-4" },
			"bottom-center": { viewport: "left-1/2 transform -translate-x-1/2" },
			"bottom-right": { viewport: "right-4" }
		},
		swipeDirection: {
			up: "data-[swipe=end]:animate-[toast-slide-up_200ms_ease-out]",
			right: "data-[swipe=end]:animate-[toast-slide-right_200ms_ease-out]",
			down: "data-[swipe=end]:animate-[toast-slide-down_200ms_ease-out]",
			left: "data-[swipe=end]:animate-[toast-slide-left_200ms_ease-out]"
		}
	},
	compoundVariants: [
		{
			position: [
				"top-left",
				"top-center",
				"top-right"
			],
			class: {
				viewport: "top-4",
				base: "top-0 data-[state=open]:animate-[toast-slide-in-from-top_200ms_ease-in-out]"
			}
		},
		{
			position: [
				"bottom-left",
				"bottom-center",
				"bottom-right"
			],
			class: {
				viewport: "bottom-4",
				base: "bottom-0 data-[state=open]:animate-[toast-slide-in-from-bottom_200ms_ease-in-out]"
			}
		},
		{
			swipeDirection: ["left", "right"],
			class: "data-[swipe=move]:translate-x-(--reka-toast-swipe-move-x) data-[swipe=end]:translate-x-(--reka-toast-swipe-end-x) data-[swipe=cancel]:translate-x-0"
		},
		{
			swipeDirection: ["up", "down"],
			class: "data-[swipe=move]:translate-y-(--reka-toast-swipe-move-y) data-[swipe=end]:translate-y-(--reka-toast-swipe-end-y) data-[swipe=cancel]:translate-y-0"
		}
	],
	defaultVariants: { position: "bottom-right" }
}, Wm = /*@__PURE__*/ Object.assign({ name: "Toaster" }, {
	props: {
		position: {
			type: null,
			required: !1
		},
		expand: {
			type: Boolean,
			required: !1,
			default: !0
		},
		progress: {
			type: Boolean,
			required: !1,
			default: !0
		},
		portal: {
			type: [Boolean, String],
			required: !1,
			skipCheck: !0,
			default: !0
		},
		max: {
			type: Number,
			required: !1,
			default: 5
		},
		class: {
			type: null,
			required: !1
		},
		ui: {
			type: Object,
			required: !1
		},
		label: {
			type: String,
			required: !1
		},
		duration: {
			type: Number,
			required: !1,
			default: 5e3
		},
		disableSwipe: {
			type: Boolean,
			required: !1
		},
		swipeThreshold: {
			type: Number,
			required: !1
		}
	},
	setup(e) {
		let t = nu("toaster", e), { toasts: n, remove: r } = Rm(), i = bc();
		Un(Lm, /* @__PURE__ */ ln(() => t.max));
		let a = ru(Ts(t, "duration", "label", "swipeThreshold", "disableSwipe")), o = Im(/* @__PURE__ */ ln(() => t.portal)), s = X(() => {
			switch (t.position) {
				case "top-center": return "up";
				case "top-right":
				case "bottom-right": return "right";
				case "bottom-center": return "down";
				case "top-left":
				case "bottom-left": return "left";
			}
			return "right";
		}), c = X(() => bf({
			extend: bf(Um),
			...i.ui?.toaster || {}
		})({
			position: t.position,
			swipeDirection: s.value
		}));
		function l(e, t) {
			e || r(t);
		}
		let u = /* @__PURE__ */ I(!1), d = X(() => t.expand || u.value), f = /* @__PURE__ */ I([]), p = X(() => f.value.reduce((e, { height: t }) => e + t + 16, 0)), m = X(() => f.value[f.value.length - 1]?.height || 0);
		function h(e) {
			return f.value.slice(e + 1).reduce((e, { height: t }) => e + t + 16, 0);
		}
		return (e, r) => (H(), W(L(Dl), Y({ "swipe-direction": s.value }, L(a)), {
			default: R(() => [
				B(e.$slots, "default"),
				(H(!0), U(V, null, Jr(L(n), (e, r) => (H(), W(Hm, Y({
					key: e.id,
					ref_for: !0,
					ref_key: "refs",
					ref: f,
					progress: L(t).progress
				}, { ref_for: !0 }, L(Ec)(e, [
					"id",
					"close",
					"_duplicate",
					"_updated"
				]), {
					close: e.close,
					"data-expanded": d.value,
					"data-front": !d.value && r === L(n).length - 1,
					"data-pulsing": e._duplicate ? e._duplicate % 2 == 0 ? "even" : "odd" : void 0,
					style: {
						"--index": r - L(n).length + L(n).length,
						"--before": L(n).length - 1 - r,
						"--offset": h(r),
						"--scale": d.value ? "1" : "calc(1 - var(--before) * var(--scale-factor))",
						"--translate": d.value ? "calc(var(--offset) * var(--translate-factor))" : "calc(var(--before) * var(--gap))",
						"--transform": "translateY(var(--translate)) scale(var(--scale))"
					},
					"data-slot": "base",
					class: c.value.base({ class: [L(t).ui?.base, e.onClick ? "cursor-pointer" : void 0] }),
					"onUpdate:open": (t) => l(t, e.id),
					onClick: (t) => e.onClick && e.onClick(e)
				}), null, 16, [
					"progress",
					"close",
					"data-expanded",
					"data-front",
					"data-pulsing",
					"style",
					"class",
					"onUpdate:open",
					"onClick"
				]))), 128)),
				K(L(Vl), j(Da(L(o))), {
					default: R(() => [K(L(Gl), {
						"data-expanded": d.value,
						"data-slot": "viewport",
						class: A(c.value.viewport({ class: [L(t).ui?.viewport, L(t).class] })),
						style: le({
							"--scale-factor": "0.05",
							"--translate-factor": L(t).position?.startsWith("top") ? "1px" : "-1px",
							"--gap": L(t).position?.startsWith("top") ? "16px" : "-16px",
							"--front-height": `${m.value}px`,
							"--height": `${p.value}px`
						}),
						onMouseenter: r[0] ||= (e) => u.value = !0,
						onMouseleave: r[1] ||= (e) => u.value = !1
					}, null, 8, [
						"data-expanded",
						"class",
						"style"
					])]),
					_: 1
				}, 16)
			]),
			_: 3
		}, 16, ["swipe-direction"]));
	}
});
//#endregion
//#region ../banner-artwork-release-20261027/node_modules/.pnpm/@nuxt+ui@4.9.0_patch_hash=4ccf9386c7cac79ac933037f07f03c58e3649f1cf82050f5b2514226e1e46_6210cc9a3324cad860a299c7c3e3caac/node_modules/@nuxt/ui/dist/runtime/composables/useOverlay.js
function Gm() {
	let e = /* @__PURE__ */ zt([]), t = (t, i) => {
		let { props: a, defaultOpen: s, destroyOnClose: c } = i || {}, l = /* @__PURE__ */ Rt({
			id: Symbol(import.meta.dev ? "useOverlay" : ""),
			isOpen: !!s,
			component: qt(t),
			isMounted: !!s,
			destroyOnClose: !!c,
			originalProps: a || {},
			props: { ...a }
		});
		return e.push(l), {
			...l,
			open: (e) => n(l.id, e),
			close: (e) => r(l.id, e),
			patch: (e) => o(l.id, e)
		};
	}, n = (e, t) => {
		let n = s(e);
		n.props = t ? {
			...n.originalProps,
			...t
		} : { ...n.originalProps }, n.isOpen = !0, n.isMounted = !0;
		let r = new Promise((e) => n.resolvePromise = e);
		return Object.assign(r, {
			id: e,
			isMounted: n.isMounted,
			isOpen: n.isOpen,
			result: r
		});
	}, r = (e, t) => {
		let n = s(e);
		n.isOpen = !1, n.resolvePromise &&= (n.resolvePromise(t), void 0);
	}, i = () => {
		e.forEach((e) => r(e.id));
	}, a = (t) => {
		let n = s(t);
		if (n.isMounted = !1, n.destroyOnClose) {
			let n = e.findIndex((e) => e.id === t);
			e.splice(n, 1);
		}
	}, o = (e, t) => {
		let n = s(e);
		n.props = {
			...n.props,
			...t
		};
	}, s = (t) => {
		let n = e.find((e) => e.id === t);
		if (!n) throw Error("Overlay not found");
		return n;
	};
	return {
		overlays: e,
		open: n,
		close: r,
		closeAll: i,
		create: t,
		patch: o,
		unmount: a,
		isOpen: (e) => s(e).isOpen
	};
}
var Km = /* @__PURE__ */ Ss(Gm), qm = {
	__name: "OverlayProvider",
	setup(e) {
		let { overlays: t, unmount: n, close: r } = Km(), i = X(() => t.filter((e) => e.isMounted)), a = (e) => {
			r(e), n(e);
		}, o = (e, t) => {
			r(e, t);
		};
		return (e, t) => (H(!0), U(V, null, Jr(i.value, (e) => (H(), W(Gr(e.component), Y({ key: e.id }, { ref_for: !0 }, e.props, {
			open: e.isOpen,
			"onUpdate:open": (t) => e.isOpen = t,
			onClose: (t) => o(e.id, t),
			"onAfter:leave": (t) => a(e.id)
		}), null, 16, [
			"open",
			"onUpdate:open",
			"onClose",
			"onAfter:leave"
		]))), 128));
	}
}, Jm = /*@__PURE__*/ Object.assign({ name: "App" }, {
	props: {
		tooltip: {
			type: Object,
			required: !1
		},
		toaster: {
			type: [Object, null],
			required: !1
		},
		locale: {
			type: Object,
			required: !1
		},
		portal: {
			type: [Boolean, String],
			required: !1,
			skipCheck: !0,
			default: "body"
		},
		dir: {
			type: String,
			required: !1
		},
		scrollBody: {
			type: [Boolean, Object],
			required: !1
		},
		nonce: {
			type: String,
			required: !1
		}
	},
	setup(e) {
		let t = e, n = Xc(Ts(t, "scrollBody")), r = /* @__PURE__ */ ln(() => t.tooltip), i = /* @__PURE__ */ ln(() => t.toaster), a = /* @__PURE__ */ ln(() => t.locale);
		return Un(Pc, a), Un(Fm, /* @__PURE__ */ ln(() => t.portal)), (o, s) => (H(), W(L(qc), Y({
			"use-id": () => vr(),
			dir: t.dir || a.value?.dir,
			locale: a.value?.code
		}, L(n)), {
			default: R(() => [K(L(Jl), j(Da(r.value)), {
				default: R(() => [e.toaster === null ? B(o.$slots, "default", {}, void 0, void 0, 1) : (H(), W(Wm, j(Y({ key: 0 }, i.value)), {
					default: R(() => [B(o.$slots, "default")]),
					_: 3
				}, 16)), K(qm)]),
				_: 3
			}, 16)]),
			_: 3
		}, 16, [
			"use-id",
			"dir",
			"locale"
		]));
	}
}), Ym = {
	slots: {
		root: "",
		wrapper: "",
		labelWrapper: "flex content-center items-center justify-between gap-1",
		label: "block font-medium text-default",
		container: "relative",
		description: "text-muted",
		error: "mt-2 text-error",
		hint: "text-muted",
		help: "mt-2 text-muted"
	},
	variants: {
		size: {
			xs: { root: "text-xs" },
			sm: { root: "text-xs" },
			md: { root: "text-sm" },
			lg: { root: "text-sm" },
			xl: { root: "text-base" }
		},
		required: { true: { label: "after:content-['*'] after:ms-0.5 after:text-error" } },
		orientation: {
			vertical: { container: "mt-1" },
			horizontal: { root: "flex justify-between place-items-baseline gap-2" }
		}
	},
	defaultVariants: { size: "md" }
}, Xm = ["id"], Zm = ["id"], Qm = ["id"], $m = ["id"], eh = {
	__name: "FormField",
	props: {
		as: {
			type: null,
			required: !1
		},
		name: {
			type: String,
			required: !1
		},
		errorPattern: {
			type: null,
			required: !1
		},
		label: {
			type: String,
			required: !1
		},
		description: {
			type: String,
			required: !1
		},
		help: {
			type: String,
			required: !1
		},
		error: {
			type: [Boolean, String],
			required: !1,
			default: void 0
		},
		hint: {
			type: String,
			required: !1
		},
		size: {
			type: null,
			required: !1
		},
		required: {
			type: Boolean,
			required: !1
		},
		eagerValidation: {
			type: Boolean,
			required: !1
		},
		validateOnInputDelay: {
			type: Number,
			required: !1
		},
		orientation: {
			type: null,
			required: !1,
			default: "vertical"
		},
		class: {
			type: null,
			required: !1
		},
		ui: {
			type: Object,
			required: !1
		}
	},
	setup(e) {
		let t = e, n = ei(), r = nu("formField", t), i = bc(), a = X(() => bf({
			extend: bf(Ym),
			...i.ui?.formField || {}
		})({
			size: r.size,
			required: r.required,
			orientation: r.orientation
		})), o = Wn(pu, null), s = X(() => r.error || o?.value?.find((e) => e.name === r.name || r.errorPattern && e.name?.match(r.errorPattern))?.message), c = /* @__PURE__ */ I(vr()), l = c.value, u = Wn(du, void 0);
		return Xn(c, () => {
			u && r.name && (u.value[r.name] = {
				id: c.value,
				pattern: r.errorPattern
			});
		}, { immediate: !0 }), Un(uu, c), Un(lu, X(() => ({
			error: s.value,
			name: r.name,
			size: r.size,
			eagerValidation: r.eagerValidation,
			validateOnInputDelay: r.validateOnInputDelay,
			errorPattern: r.errorPattern,
			hint: r.hint,
			description: r.description,
			help: r.help,
			ariaId: l
		}))), (e, t) => (H(), W(L(rl), {
			as: L(r).as,
			"data-orientation": L(r).orientation,
			"data-slot": "root",
			class: A(a.value.root({ class: [L(r).ui?.root, L(r).class] }))
		}, {
			default: R(() => [G("div", {
				"data-slot": "wrapper",
				class: A(a.value.wrapper({ class: L(r).ui?.wrapper }))
			}, [L(r).label || n.label ? (H(), U("div", {
				key: 0,
				"data-slot": "labelWrapper",
				class: A(a.value.labelWrapper({ class: L(r).ui?.labelWrapper }))
			}, [K(L(hl), {
				for: c.value,
				"data-slot": "label",
				class: A(a.value.label({ class: L(r).ui?.label }))
			}, {
				default: R(() => [B(e.$slots, "label", { label: L(r).label }, () => [q(M(L(r).label), 1)])]),
				_: 3
			}, 8, ["for", "class"]), L(r).hint || n.hint ? (H(), U("span", {
				key: 0,
				id: `${L(l)}-hint`,
				"data-slot": "hint",
				class: A(a.value.hint({ class: L(r).ui?.hint }))
			}, [B(e.$slots, "hint", { hint: L(r).hint }, () => [q(M(L(r).hint), 1)])], 10, Xm)) : J("", !0)], 2)) : J("", !0), L(r).description || n.description ? (H(), U("p", {
				key: 1,
				id: `${L(l)}-description`,
				"data-slot": "description",
				class: A(a.value.description({ class: L(r).ui?.description }))
			}, [B(e.$slots, "description", { description: L(r).description }, () => [q(M(L(r).description), 1)])], 10, Zm)) : J("", !0)], 2), G("div", { class: A([(L(r).label || !!n.label || L(r).description || !!n.description) && a.value.container({ class: L(r).ui?.container })]) }, [B(e.$slots, "default", { error: s.value }), L(r).error !== !1 && (typeof s.value == "string" && s.value || n.error) ? (H(), U("div", {
				key: 0,
				id: `${L(l)}-error`,
				"data-slot": "error",
				class: A(a.value.error({ class: L(r).ui?.error }))
			}, [B(e.$slots, "error", { error: s.value }, () => [q(M(s.value), 1)])], 10, Qm)) : L(r).help || n.help ? (H(), U("div", {
				key: 1,
				id: `${L(l)}-help`,
				"data-slot": "help",
				class: A(a.value.help({ class: L(r).ui?.help }))
			}, [B(e.$slots, "help", { help: L(r).help }, () => [q(M(L(r).help), 1)])], 10, $m)) : J("", !0)], 2)]),
			_: 3
		}, 8, [
			"as",
			"data-orientation",
			"class"
		]));
	}
}, th = {
	slots: {
		root: "relative inline-flex items-center",
		base: ["w-full rounded-md border-0 appearance-none placeholder:text-dimmed disabled:cursor-not-allowed disabled:opacity-75", "transition-colors"],
		leading: "absolute inset-y-0 start-0 flex items-center",
		leadingIcon: "shrink-0 text-dimmed",
		leadingAvatar: "shrink-0",
		leadingAvatarSize: "",
		trailing: "absolute inset-y-0 end-0 flex items-center",
		trailingIcon: "shrink-0 text-dimmed"
	},
	variants: {
		fieldGroup: {
			horizontal: {
				root: "group has-focus-visible:z-[1]",
				base: "group-not-only:group-first:rounded-e-none group-not-only:group-last:rounded-s-none group-not-last:group-not-first:rounded-none"
			},
			vertical: {
				root: "group has-focus-visible:z-[1]",
				base: "group-not-only:group-first:rounded-b-none group-not-only:group-last:rounded-t-none group-not-last:group-not-first:rounded-none"
			}
		},
		size: {
			xs: {
				base: "px-2 py-1 text-sm/4 gap-1",
				leading: "ps-2",
				trailing: "pe-2",
				leadingIcon: "size-4",
				leadingAvatarSize: "3xs",
				trailingIcon: "size-4"
			},
			sm: {
				base: "px-2.5 py-1.5 text-sm/4 gap-1.5",
				leading: "ps-2.5",
				trailing: "pe-2.5",
				leadingIcon: "size-4",
				leadingAvatarSize: "3xs",
				trailingIcon: "size-4"
			},
			md: {
				base: "px-2.5 py-1.5 text-base/5 gap-1.5",
				leading: "ps-2.5",
				trailing: "pe-2.5",
				leadingIcon: "size-5",
				leadingAvatarSize: "2xs",
				trailingIcon: "size-5"
			},
			lg: {
				base: "px-3 py-2 text-base/5 gap-2",
				leading: "ps-3",
				trailing: "pe-3",
				leadingIcon: "size-5",
				leadingAvatarSize: "2xs",
				trailingIcon: "size-5"
			},
			xl: {
				base: "px-3 py-2 text-base gap-2",
				leading: "ps-3",
				trailing: "pe-3",
				leadingIcon: "size-6",
				leadingAvatarSize: "xs",
				trailingIcon: "size-6"
			}
		},
		variant: {
			outline: "text-highlighted bg-default ring ring-inset ring-accented",
			soft: "text-highlighted bg-elevated/50 hover:bg-elevated focus:bg-elevated disabled:bg-elevated/50",
			subtle: "text-highlighted bg-elevated ring ring-inset ring-accented",
			ghost: "text-highlighted bg-transparent hover:bg-elevated focus:bg-elevated disabled:bg-transparent dark:disabled:bg-transparent",
			none: "text-highlighted bg-transparent focus:outline-none"
		},
		color: {
			primary: "",
			secondary: "",
			success: "",
			info: "",
			warning: "",
			error: "",
			neutral: ""
		},
		leading: { true: "" },
		trailing: { true: "" },
		loading: { true: "" },
		highlight: { true: "" },
		fixed: { false: "" },
		type: { file: "file:me-1.5 file:font-medium file:text-muted file:outline-none" }
	},
	compoundVariants: [
		{
			color: "primary",
			variant: ["outline", "subtle"],
			class: "outline-primary/25 focus-visible:outline-3 focus-visible:ring-primary"
		},
		{
			color: "secondary",
			variant: ["outline", "subtle"],
			class: "outline-secondary/25 focus-visible:outline-3 focus-visible:ring-secondary"
		},
		{
			color: "success",
			variant: ["outline", "subtle"],
			class: "outline-success/25 focus-visible:outline-3 focus-visible:ring-success"
		},
		{
			color: "info",
			variant: ["outline", "subtle"],
			class: "outline-info/25 focus-visible:outline-3 focus-visible:ring-info"
		},
		{
			color: "warning",
			variant: ["outline", "subtle"],
			class: "outline-warning/25 focus-visible:outline-3 focus-visible:ring-warning"
		},
		{
			color: "error",
			variant: ["outline", "subtle"],
			class: "outline-error/25 focus-visible:outline-3 focus-visible:ring-error"
		},
		{
			color: "primary",
			variant: ["soft", "ghost"],
			class: "outline-primary/25 focus-visible:outline-3"
		},
		{
			color: "secondary",
			variant: ["soft", "ghost"],
			class: "outline-secondary/25 focus-visible:outline-3"
		},
		{
			color: "success",
			variant: ["soft", "ghost"],
			class: "outline-success/25 focus-visible:outline-3"
		},
		{
			color: "info",
			variant: ["soft", "ghost"],
			class: "outline-info/25 focus-visible:outline-3"
		},
		{
			color: "warning",
			variant: ["soft", "ghost"],
			class: "outline-warning/25 focus-visible:outline-3"
		},
		{
			color: "error",
			variant: ["soft", "ghost"],
			class: "outline-error/25 focus-visible:outline-3"
		},
		{
			color: "primary",
			highlight: !0,
			class: "ring ring-inset ring-primary"
		},
		{
			color: "secondary",
			highlight: !0,
			class: "ring ring-inset ring-secondary"
		},
		{
			color: "success",
			highlight: !0,
			class: "ring ring-inset ring-success"
		},
		{
			color: "info",
			highlight: !0,
			class: "ring ring-inset ring-info"
		},
		{
			color: "warning",
			highlight: !0,
			class: "ring ring-inset ring-warning"
		},
		{
			color: "error",
			highlight: !0,
			class: "ring ring-inset ring-error"
		},
		{
			color: "neutral",
			variant: ["outline", "subtle"],
			class: "outline-inverted/25 focus-visible:outline-3 focus-visible:ring-inverted"
		},
		{
			color: "neutral",
			variant: ["soft", "ghost"],
			class: "outline-inverted/25 focus-visible:outline-3"
		},
		{
			color: "neutral",
			highlight: !0,
			class: "ring ring-inset ring-inverted"
		},
		{
			leading: !0,
			size: "xs",
			class: "ps-7"
		},
		{
			leading: !0,
			size: "sm",
			class: "ps-8"
		},
		{
			leading: !0,
			size: "md",
			class: "ps-9"
		},
		{
			leading: !0,
			size: "lg",
			class: "ps-10"
		},
		{
			leading: !0,
			size: "xl",
			class: "ps-11"
		},
		{
			trailing: !0,
			size: "xs",
			class: "pe-7"
		},
		{
			trailing: !0,
			size: "sm",
			class: "pe-8"
		},
		{
			trailing: !0,
			size: "md",
			class: "pe-9"
		},
		{
			trailing: !0,
			size: "lg",
			class: "pe-10"
		},
		{
			trailing: !0,
			size: "xl",
			class: "pe-11"
		},
		{
			loading: !0,
			leading: !0,
			class: { leadingIcon: "animate-spin" }
		},
		{
			loading: !0,
			leading: !1,
			trailing: !0,
			class: { trailingIcon: "animate-spin" }
		},
		{
			fixed: !1,
			size: "xs",
			class: "md:text-xs"
		},
		{
			fixed: !1,
			size: "sm",
			class: "md:text-xs"
		},
		{
			fixed: !1,
			size: "md",
			class: "md:text-sm"
		},
		{
			fixed: !1,
			size: "lg",
			class: "md:text-sm"
		}
	],
	defaultVariants: {
		size: "md",
		color: "primary",
		variant: "outline"
	}
}, nh = [
	"id",
	"type",
	"value",
	"name",
	"placeholder",
	"disabled",
	"required",
	"autocomplete"
], rh = /*@__PURE__*/ Object.assign({ inheritAttrs: !1 }, {
	__name: "Input",
	props: {
		as: {
			type: null,
			required: !1
		},
		id: {
			type: String,
			required: !1
		},
		name: {
			type: String,
			required: !1
		},
		type: {
			type: null,
			required: !1,
			default: "text"
		},
		placeholder: {
			type: String,
			required: !1
		},
		color: {
			type: null,
			required: !1
		},
		variant: {
			type: null,
			required: !1
		},
		size: {
			type: null,
			required: !1
		},
		required: {
			type: Boolean,
			required: !1
		},
		autocomplete: {
			type: [String, Object],
			required: !1,
			default: "off"
		},
		autofocus: {
			type: Boolean,
			required: !1
		},
		autofocusDelay: {
			type: Number,
			required: !1,
			default: 0
		},
		disabled: {
			type: Boolean,
			required: !1
		},
		highlight: {
			type: Boolean,
			required: !1
		},
		fixed: {
			type: Boolean,
			required: !1
		},
		modelValue: {
			type: null,
			required: !1
		},
		defaultValue: {
			type: null,
			required: !1
		},
		modelModifiers: {
			type: null,
			required: !1
		},
		class: {
			type: null,
			required: !1
		},
		ui: {
			type: Object,
			required: !1
		},
		icon: {
			type: null,
			required: !1
		},
		avatar: {
			type: Object,
			required: !1
		},
		leading: {
			type: Boolean,
			required: !1
		},
		leadingIcon: {
			type: null,
			required: !1
		},
		trailing: {
			type: Boolean,
			required: !1
		},
		trailingIcon: {
			type: null,
			required: !1
		},
		loading: {
			type: Boolean,
			required: !1
		},
		loadingIcon: {
			type: null,
			required: !1
		}
	},
	emits: [
		"update:modelValue",
		"blur",
		"change"
	],
	setup(e, { expose: t, emit: n }) {
		let r = e, i = n, a = ei(), o = nu("input", r), s = Rs(o, "modelValue", i, { defaultValue: o.defaultValue }), c = bc(), { emitFormBlur: l, emitFormInput: u, emitFormChange: d, size: f, color: p, id: m, name: h, highlight: g, disabled: _, emitFormFocus: v, ariaAttrs: y } = mu(r, { deferInputValidation: !0 }), { orientation: b, size: x } = ou(r), { isLeading: S, isTrailing: C, leadingIconName: w, trailingIconName: T } = iu(o), ee = X(() => x.value || f.value), E = X(() => bf({
			extend: bf(th),
			...c.ui?.input || {}
		})({
			type: o.type,
			color: p.value ?? o.color,
			variant: o.variant,
			size: ee?.value ?? o.size,
			loading: o.loading,
			highlight: g.value ?? o.highlight,
			fixed: o.fixed,
			leading: S.value || !!o.avatar || !!a.leading,
			trailing: C.value || !!a.trailing,
			fieldGroup: b.value
		})), D = br("inputRef");
		function te(e) {
			o.modelModifiers?.trim && (typeof e == "string" || e == null) && (e = e?.trim() ?? null), (o.modelModifiers?.number || o.type === "number") && (e = Oc(e)), o.modelModifiers?.nullable && (e ||= null), o.modelModifiers?.optional && !o.modelModifiers?.nullable && e !== null && (e ||= void 0), s.value = e, u();
		}
		function ne(e) {
			o.modelModifiers?.lazy || te(e.target.value);
		}
		function re(e) {
			let t = e.target.value;
			o.modelModifiers?.lazy && te(t), o.modelModifiers?.trim && (e.target.value = t.trim()), d(), i("change", e);
		}
		function ie(e) {
			l(), i("blur", e);
		}
		function O() {
			o.autofocus && D.value?.focus();
		}
		return Pr(() => {
			setTimeout(() => {
				O();
			}, o.autofocusDelay);
		}), t({ inputRef: D }), (e, t) => (H(), W(L(rl), {
			as: L(o).as,
			"data-slot": "root",
			class: A(E.value.root({ class: [L(o).ui?.root, L(o).class] }))
		}, {
			default: R(() => [
				G("input", Y({
					id: L(m),
					ref_key: "inputRef",
					ref: D,
					type: L(o).type,
					value: L(s),
					name: L(h),
					placeholder: L(o).placeholder,
					"data-slot": "base",
					class: E.value.base({ class: L(o).ui?.base }),
					disabled: L(_),
					required: L(o).required,
					autocomplete: L(o).autocomplete
				}, {
					...e.$attrs,
					...L(y)
				}, {
					onInput: ne,
					onBlur: ie,
					onChange: re,
					onFocus: t[0] ||= (...e) => L(v) && L(v)(...e)
				}), null, 16, nh),
				B(e.$slots, "default", { ui: E.value }),
				L(S) || L(o).avatar || a.leading ? (H(), U("span", {
					key: 0,
					"data-slot": "leading",
					class: A(E.value.leading({ class: L(o).ui?.leading }))
				}, [B(e.$slots, "leading", { ui: E.value }, () => [L(S) && L(w) ? (H(), W(lm, {
					key: 0,
					name: L(w),
					"data-slot": "leadingIcon",
					class: A(E.value.leadingIcon({ class: L(o).ui?.leadingIcon }))
				}, null, 8, ["name", "class"])) : L(o).avatar ? (H(), W(hm, Y({
					key: 1,
					size: L(o).ui?.leadingAvatarSize || E.value.leadingAvatarSize()
				}, L(o).avatar, {
					"data-slot": "leadingAvatar",
					class: E.value.leadingAvatar({ class: L(o).ui?.leadingAvatar })
				}), null, 16, ["size", "class"])) : J("", !0)])], 2)) : J("", !0),
				L(C) || a.trailing ? (H(), U("span", {
					key: 1,
					"data-slot": "trailing",
					class: A(E.value.trailing({ class: L(o).ui?.trailing }))
				}, [B(e.$slots, "trailing", { ui: E.value }, () => [L(T) ? (H(), W(lm, {
					key: 0,
					name: L(T),
					"data-slot": "trailingIcon",
					class: A(E.value.trailingIcon({ class: L(o).ui?.trailingIcon }))
				}, null, 8, ["name", "class"])) : J("", !0)])], 2)) : J("", !0)
			]),
			_: 3
		}, 8, ["as", "class"]));
	}
}), ih = Object.freeze({
	photoflow: "photocraft_canvas",
	photocraft: "photocraft_canvas",
	vectorflow: "vectorcraft_canvas",
	vectorcraft: "vectorcraft_canvas",
	effectflow: "effectcraft_canvas",
	effectcraft: "effectcraft_canvas",
	filmflow: "filmcraft_canvas",
	filmcraft: "filmcraft_canvas",
	figflow: "figcraft_canvas",
	figcraft: "figcraft_canvas"
});
function ah(e) {
	return ih[e.split("/")[1]] || null;
}
function oh(e = document, t = location.pathname) {
	let n = ah(t), r = e.defaultView;
	if (!n || !r) return null;
	for (let t of e.querySelectorAll(`canvas#${n}`)) {
		if (!(t instanceof r.HTMLCanvasElement) || !t.isConnected) continue;
		let e = t.getBoundingClientRect(), n = r.getComputedStyle(t);
		if (e.width > 0 && e.height > 0 && e.bottom > 0 && e.right > 0 && e.top < r.innerHeight && e.left < r.innerWidth && n.display !== "none" && n.visibility !== "hidden" && n.visibility !== "collapse" && Number(n.opacity) > 0) return t;
	}
	return null;
}
var sh = Object.freeze({
	"image/png": ["png"],
	"image/jpeg": ["jpg", "jpeg"],
	"image/webp": ["webp"],
	"image/avif": ["avif"],
	"image/svg+xml": ["svg"],
	"application/pdf": ["pdf"],
	"font/woff2": ["woff2"],
	"font/woff": ["woff"],
	"font/ttf": ["ttf"],
	"font/otf": ["otf"]
});
function ch(e) {
	let t = String(e.name || "").replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, "-").slice(0, 140) || "Motorstack asset", n = sh[String(e.mime || "").toLowerCase().split(";")[0].trim()];
	if (!n) return t;
	let r = t.toLowerCase();
	return n.some((e) => r.endsWith("." + e)) ? t : t + "." + n[0];
}
function lh(e) {
	return (Array.isArray(e) ? e : []).filter((e) => typeof e == "string").slice(0, 5).map((e) => e.slice(0, 240));
}
//#endregion
//#region workers/craft-editors/asset-library/AssetLibrary.vue
var uh = { class: "xf-library" }, dh = {
	class: "xf-library-panel",
	role: "dialog",
	"aria-label": "Motorstack asset library",
	"aria-modal": "false"
}, fh = { class: "xf-library-head" }, ph = { class: "xf-library-controls" }, mh = {
	class: "xf-library-brands",
	"aria-label": "Choose a brand"
}, hh = {
	class: "xf-library-kinds",
	"aria-label": "Asset category"
}, gh = { class: "xf-library-model-controls" }, _h = {
	class: "xf-library-scroll",
	"aria-live": "polite"
}, vh = {
	key: 0,
	class: "xf-library-state",
	role: "status"
}, yh = {
	key: 1,
	class: "xf-library-state"
}, bh = {
	key: 2,
	class: "xf-library-state"
}, xh = {
	key: 0,
	class: "xf-library-warnings",
	role: "status"
}, Sh = { key: 0 }, Ch = {
	key: 1,
	class: "xf-library-colors"
}, wh = { class: "xf-library-count" }, Th = {
	key: 2,
	class: "xf-library-state"
}, Eh = { class: "xf-library-grid" }, Dh = ["src", "alt"], Oh = {
	key: 1,
	class: "xf-library-file"
}, kh = { class: "xf-library-card-body" }, Ah = { class: "xf-library-card-actions" }, jh = { class: "xf-library-notice" }, Mh = {
	key: 0,
	role: "status"
}, Nh = { key: 1 }, Ph = { key: 2 }, Fh = {
	__name: "AssetLibrary",
	props: [
		"opened",
		"close",
		"ready"
	],
	setup(e) {
		let t = e, n = /* @__PURE__ */ I([]), r = /* @__PURE__ */ I(""), i = /* @__PURE__ */ I("all"), a = /* @__PURE__ */ I(""), o = /* @__PURE__ */ I([]), s = /* @__PURE__ */ I([]), c = /* @__PURE__ */ I(""), l = /* @__PURE__ */ I(""), u = /* @__PURE__ */ I(""), d = X(() => i.value === "media"), f = /* @__PURE__ */ I(!1), p = /* @__PURE__ */ I([]), m = /* @__PURE__ */ I(!1), h = /* @__PURE__ */ I(""), g = /* @__PURE__ */ I(!1), _ = /* @__PURE__ */ I(""), v = /* @__PURE__ */ I(""), y = 0, b = [
			{
				id: "all",
				name: "All assets"
			},
			{
				id: "slides",
				name: "Banners"
			},
			{
				id: "media",
				name: "Photos & brochures"
			},
			{
				id: "brand",
				name: "Brand kit"
			}
		], x = !!ah(location.pathname), S = X(() => o.value.filter((e) => !a.value.trim() || e.name.toLowerCase().includes(a.value.trim().toLowerCase())));
		function C(e) {
			try {
				let t = new URL(e, location.origin);
				return t.origin === location.origin && t.pathname === "/__assets/motorstack/file" && !t.username && !t.password ? t.href : null;
			} catch {
				return null;
			}
		}
		async function w(e) {
			let t;
			try {
				t = await fetch(e, {
					credentials: "same-origin",
					cache: "no-store",
					redirect: "error"
				});
			} catch {
				throw Error("The asset library is unavailable. Try again.");
			}
			if (!t.ok) {
				let e = /* @__PURE__ */ Error(t.status === 401 || t.status === 403 ? "Sign in to XeroFlow to use this library." : "The asset library is unavailable. Try again.");
				throw e.status = t.status, e;
			}
			return t;
		}
		function T(e) {
			g.value = e.status === 401 || e.status === 403, h.value = e.message || "The asset library is unavailable. Try again.";
		}
		async function ee() {
			m.value = !0, h.value = "";
			try {
				let e = await (await w("/__assets/motorstack/brands")).json();
				n.value = Array.isArray(e.brands) ? e.brands.filter((e) => typeof e.id == "string" && typeof e.name == "string") : [], n.value.length && (r.value = n.value[0].id, await E());
			} catch (e) {
				T(e);
			} finally {
				m.value = !1;
			}
		}
		async function E() {
			if (!r.value) return;
			let e = ++y;
			m.value = !0, h.value = "", g.value = !1, _.value = "";
			try {
				let t = new URLSearchParams({
					brand: r.value,
					kind: i.value
				});
				d.value && l.value && t.set("model", l.value);
				let n = await (await w("/__assets/motorstack/catalog?" + t)).json();
				if (e !== y) return;
				f.value = n.truncated === !0, p.value = lh(n.warnings), o.value = (Array.isArray(n.assets) ? n.assets : []).filter((e) => e && typeof e.id == "string" && typeof e.name == "string" && C(e.url)).map((e) => ({
					...e,
					url: C(e.url),
					thumbnail: C(e.thumbnail)
				})), s.value = (Array.isArray(n.colors) ? n.colors : []).map((e) => typeof e == "string" ? {
					name: e,
					value: e
				} : e).filter((e) => /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(e.value || e.hex || "")).map((e) => ({
					name: e.name || e.value || e.hex,
					value: e.value || e.hex
				}));
			} catch (t) {
				e === y && T(t);
			} finally {
				e === y && (m.value = !1);
			}
		}
		Xn(r, (e, t) => {
			c.value = "", l.value = "", u.value = "", e && t && E();
		}), Xn(i, (e) => {
			e !== "media" && (c.value = "", l.value = "", u.value = ""), r.value && E();
		});
		function D() {
			if (!d.value) return;
			let e = c.value.trim();
			if (e.length > 100) {
				u.value = "Use a model name of 100 characters or fewer.";
				return;
			}
			u.value = "", l.value = e, E();
		}
		function te(e) {
			return /^image\/(png|jpeg|webp|avif)$/i.test(e.mime || "");
		}
		async function ne(e) {
			let t = await (await w(e.url)).blob();
			if (t.size > 33554432) throw Error("This asset is too large to import here.");
			return t;
		}
		async function re(e) {
			v.value = e.id, h.value = "";
			try {
				let t = await ne(e), n = URL.createObjectURL(t), r = document.createElement("a");
				r.href = n, r.download = ch(e), document.body.append(r), r.click(), r.remove(), setTimeout(() => URL.revokeObjectURL(n), 3e4), _.value = "Download started.";
			} catch (e) {
				T(e);
			} finally {
				v.value = "";
			}
		}
		async function ie(e) {
			v.value = e.id, h.value = "";
			try {
				if (!x || !te(e) || e.importable === !1) return;
				let t = oh();
				if (!t) throw Error("Open a document in the editor, then try again.");
				let n = await ne(e);
				if (!/^image\/(png|jpeg|webp|avif)$/i.test(n.type)) throw Error("This asset cannot be sent to the editor. Download it instead.");
				if (typeof DataTransfer != "function" || typeof DragEvent != "function") throw Error("This browser cannot send files directly. Download the asset, then open it in your editor.");
				let r = new DataTransfer();
				r.items.add(new File([n], ch(e), { type: n.type }));
				let i = t.getBoundingClientRect();
				for (let e of [
					"dragenter",
					"dragover",
					"drop"
				]) t.dispatchEvent(new DragEvent(e, {
					bubbles: !0,
					cancelable: !0,
					dataTransfer: r,
					clientX: i.left + i.width / 2,
					clientY: i.top + i.height / 2
				}));
				_.value = "Sent to the editor. The editor chooses how to open or import the file.";
			} catch (e) {
				T(e);
			} finally {
				v.value = "";
			}
		}
		return Pr(async () => {
			t.ready?.(), await ee();
		}), (t, o) => {
			let l = bm, y = rh, C = eh, w = Jm;
			return H(), W(w, {
				toaster: null,
				portal: !1
			}, {
				default: R(() => [G("div", uh, [G("section", dh, [
					G("header", fh, [o[4] ||= G("div", null, [G("h2", null, "Motorstack assets"), G("p", null, "Your connected brand library")], -1), K(l, {
						color: "neutral",
						variant: "ghost",
						"aria-label": "Close asset library",
						onClick: e.close
					}, {
						default: R(() => [...o[3] ||= [q("Close", -1)]]),
						_: 1
					}, 8, ["onClick"])]),
					G("div", ph, [
						G("div", mh, [(H(!0), U(V, null, Jr(n.value, (e) => (H(), W(l, {
							key: e.id,
							size: "xs",
							color: r.value === e.id ? "primary" : "neutral",
							variant: r.value === e.id ? "soft" : "ghost",
							"aria-pressed": r.value === e.id,
							onClick: (t) => r.value = e.id
						}, {
							default: R(() => [q(M(e.name), 1)]),
							_: 2
						}, 1032, [
							"color",
							"variant",
							"aria-pressed",
							"onClick"
						]))), 128))]),
						K(C, { label: "Find an asset" }, {
							default: R(() => [K(y, {
								modelValue: a.value,
								"onUpdate:modelValue": o[0] ||= (e) => a.value = e,
								placeholder: "Search names in this library",
								class: "w-full"
							}, null, 8, ["modelValue"])]),
							_: 1
						}),
						G("div", hh, [(H(), U(V, null, Jr(b, (e) => K(l, {
							key: e.id,
							size: "xs",
							color: i.value === e.id ? "primary" : "neutral",
							variant: i.value === e.id ? "soft" : "ghost",
							"aria-pressed": i.value === e.id,
							onClick: (t) => i.value = e.id
						}, {
							default: R(() => [q(M(e.name), 1)]),
							_: 2
						}, 1032, [
							"color",
							"variant",
							"aria-pressed",
							"onClick"
						])), 64))]),
						K(C, {
							label: "Media model (optional)",
							error: u.value,
							class: "xf-library-model"
						}, {
							default: R(() => [G("div", gh, [K(y, {
								modelValue: c.value,
								"onUpdate:modelValue": o[1] ||= (e) => c.value = e,
								placeholder: "e.g. Ariya",
								maxlength: 100,
								disabled: !d.value,
								class: "w-full",
								onKeydown: qo(Go(D, ["prevent"]), ["enter"])
							}, null, 8, [
								"modelValue",
								"disabled",
								"onKeydown"
							]), K(l, {
								color: "neutral",
								variant: "soft",
								disabled: !d.value || m.value,
								onClick: D
							}, {
								default: R(() => [...o[5] ||= [q("Apply", -1)]]),
								_: 1
							}, 8, ["disabled"])])]),
							_: 1
						}, 8, ["error"])
					]),
					G("div", _h, [h.value ? (H(), U("div", vh, [G("p", null, M(h.value), 1), g.value ? (H(), W(l, {
						key: 1,
						to: "/__auth/start?return=%2F",
						target: "_blank",
						rel: "noopener noreferrer",
						class: "mt-3"
					}, {
						default: R(() => [...o[7] ||= [q("Sign in to XeroFlow", -1)]]),
						_: 1
					})) : (H(), W(l, {
						key: 0,
						variant: "soft",
						class: "mt-3",
						onClick: o[2] ||= (e) => n.value.length ? E() : ee()
					}, {
						default: R(() => [...o[6] ||= [q("Try again", -1)]]),
						_: 1
					}))])) : m.value ? (H(), U("p", yh, "Loading your library…")) : n.value.length ? (H(), U(V, { key: 3 }, [
						f.value || p.value.length ? (H(), U("div", xh, [f.value ? (H(), U("p", Sh, "Showing the first selection of assets. Choose a category or media model to narrow the results.")) : J("", !0), (H(!0), U(V, null, Jr(p.value, (e, t) => (H(), U("p", { key: t }, M(e), 1))), 128))])) : J("", !0),
						s.value.length && !a.value ? (H(), U("div", Ch, [o[8] ||= G("h3", { class: "xf-library-section" }, "Brand colours", -1), (H(!0), U(V, null, Jr(s.value, (e) => (H(), U("span", {
							key: e.value,
							class: "xf-library-color"
						}, [G("span", {
							class: "xf-library-swatch",
							style: le({ backgroundColor: e.value })
						}, null, 4), q(M(e.name) + " " + M(e.value), 1)]))), 128))])) : J("", !0),
						G("p", wh, M(S.value.length) + " " + M(S.value.length === 1 ? "asset" : "assets"), 1),
						S.value.length ? J("", !0) : (H(), U("p", Th, "No matching assets. Try another name, brand or category.")),
						G("div", Eh, [(H(!0), U(V, null, Jr(S.value, (e) => (H(), U("article", {
							key: e.id,
							class: "xf-library-card"
						}, [e.thumbnail ? (H(), U("img", {
							key: 0,
							src: e.thumbnail,
							alt: e.name,
							loading: "lazy",
							class: "xf-library-art"
						}, null, 8, Dh)) : (H(), U("div", Oh, M(e.type || "File"), 1)), G("div", kh, [G("h3", null, M(e.name), 1), G("div", Ah, [x && te(e) && e.importable !== !1 ? (H(), W(l, {
							key: 0,
							size: "xs",
							color: "primary",
							variant: "soft",
							disabled: !!v.value,
							onClick: (t) => ie(e)
						}, {
							default: R(() => [q(M(v.value === e.id ? "Working…" : "Send to editor"), 1)]),
							_: 2
						}, 1032, ["disabled", "onClick"])) : J("", !0), K(l, {
							size: "xs",
							color: "neutral",
							variant: "outline",
							disabled: !!v.value,
							onClick: (t) => re(e)
						}, {
							default: R(() => [...o[9] ||= [q("Download", -1)]]),
							_: 1
						}, 8, ["disabled", "onClick"])])])]))), 128))])
					], 64)) : (H(), U("p", bh, "No brands are connected to this library."))]),
					G("footer", jh, [_.value ? (H(), U("span", Mh, M(_.value), 1)) : x ? (H(), U("span", Ph, "Choose an image to send to the editor, or download a file.")) : (H(), U("span", Nh, "This library contains visual assets. Download them to use in another application."))])
				])])]),
				_: 1
			});
		};
	}
}, Ih = /* @__PURE__ */ I(!1), Lh, Rh, zh, Bh = !1;
function Vh() {
	Ih.value = !1, Lh.hidden = !0, zh?.focus();
}
function Hh(e) {
	if (zh = e, !Bh) {
		Lh = document.createElement("div"), Lh.id = "xf-asset-library", Rh = Lh.attachShadow({ mode: "open" });
		let e = document.createElement("link");
		e.rel = "stylesheet", e.href = "/asset-library.css";
		let t = document.createElement("div");
		t.className = "dark", Rh.append(e, t), document.body.append(Lh), Zo(Fh, {
			opened: Ih,
			close: Vh,
			ready: () => Rh.querySelector("input")?.focus()
		}).use(Pm).mount(t), Bh = !0;
	}
	Lh.hidden = !1, Ih.value = !0, setTimeout(() => Rh.querySelector("input")?.focus(), 0);
}
function Uh() {
	let e = document.querySelector(".xf-dock-panel");
	if (!e || e.querySelector("[data-xf-assets]")) return;
	let t = document.createElement("div");
	t.dataset.xfAssets = "";
	let n = t.attachShadow({ mode: "open" }), r = document.createElement("style");
	r.textContent = ":host{display:block;flex:none;padding-bottom:5px}.xf-library-dock-action{box-sizing:border-box;display:flex;align-items:center;justify-content:center;flex:none;width:60px;min-width:60px;height:45px;padding:0 8px;gap:0;white-space:nowrap;overflow:visible;border:1px solid #ffffff55;border-radius:11px;background:linear-gradient(145deg,#ffffff20,#ffffff08),#16171c70;color:#fff;cursor:pointer;font:650 12px/1 system-ui;letter-spacing:0;text-shadow:0 1px 3px #0008;box-shadow:inset 0 1px #ffffff30,0 2px 5px #0002}.xf-library-dock-action:hover{background-color:#16171ca0}.xf-library-dock-action:focus-visible{outline:2px solid #67e8f9;outline-offset:3px}@media(max-width:450px){.xf-library-dock-action{width:48px;min-width:48px;height:32px;padding:0 5px;font-size:11px}}@media(max-width:360px){.xf-library-dock-action{width:44px;min-width:44px;height:26px;padding:0 4px;font-size:10px}}";
	let i = document.createElement("link");
	i.rel = "stylesheet", i.href = "/asset-library.css";
	let a = document.createElement("div");
	a.className = "dark", n.append(i, r, a), e.append(t), Zo({ render: () => to(bm, {
		class: "xf-library-dock-action",
		color: "neutral",
		variant: "ghost",
		"aria-label": "Open Motorstack asset library",
		"aria-haspopup": "dialog",
		onClick: (e) => Hh(e.currentTarget)
	}, () => "Assets") }).use(Pm).mount(a);
}
document.addEventListener("xf-dock-ready", Uh), window.addEventListener("keydown", (e) => {
	Ih.value && e.key === "Escape" && (e.preventDefault(), e.stopImmediatePropagation(), Vh());
}, !0), Uh();
//#endregion
