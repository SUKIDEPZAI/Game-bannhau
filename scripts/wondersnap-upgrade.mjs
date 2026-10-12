// Local WonderSnap enhancement and Vietnamese localization layer.
// Operates only on a pinned upstream checkout and fails closed if reviewed anchors drift.

function replaceOnce(source, anchor, replacement, name) {
  const first = source.indexOf(anchor);
  if (first < 0) throw new Error(`WonderSnap upgrade anchor missing: ${name}`);
  if (source.indexOf(anchor, first + anchor.length) >= 0) throw new Error(`WonderSnap upgrade anchor is ambiguous: ${name}`);
  return source.slice(0, first) + replacement + source.slice(first + anchor.length);
}

const I18N = String.raw`
// Bản địa hóa giao diện tiếng Việt; tên nội bộ của mô hình vẫn giữ nguyên để không làm hỏng logic.
const VI_CATEGORIES = Object.freeze({ Wonders: 'Kỳ quan', Anatomy: 'Giải phẫu', Biology: 'Sinh học', Engines: 'Động cơ', Vehicles: 'Phương tiện', Machines: 'Máy móc' });
const VI_MODELS = Object.freeze({
  'Eiffel Tower':'Tháp Eiffel', 'Human Brain':'Não người', 'Human Heart':'Tim người', 'Human Kidney':'Thận người', Kidney:'Thận', Lungs:'Phổi', 'Human Eye':'Mắt người', 'Human Ear':'Tai người',
  'Tooth (Molar)':'Răng hàm', Skull:'Hộp sọ', Skeleton:'Bộ xương', 'Human Body':'Cơ thể người', 'DNA Double Helix':'Chuỗi xoắn kép ADN', 'Animal Cell':'Tế bào động vật',
  'Sports Car':'Siêu xe thể thao', Motorcycle:'Xe mô tô', Airliner:'Máy bay chở khách', 'Turbofan Jet Engine':'Động cơ phản lực tuabin', 'Saturn V Rocket':'Tên lửa Saturn V',
  'Mechanical Watch':'Đồng hồ cơ', 'EV Battery Pack':'Bộ pin xe điện', 'Supercharged HEMI V8':'Động cơ HEMI V8 siêu nạp', 'Inline-4 Engine':'Động cơ 4 xi-lanh thẳng hàng',
  'Radial Aircraft Engine':'Động cơ máy bay hướng tâm', 'Great Pyramid':'Đại kim tự tháp Giza', Colosseum:'Đấu trường La Mã', 'Leaning Tower of Pisa':'Tháp nghiêng Pisa', 'Taj Mahal':'Đền Taj Mahal',
  'Big Ben':'Tháp Big Ben', 'Statue of Liberty':'Tượng Nữ thần Tự do', 'Burj Khalifa':'Tháp Burj Khalifa', 'Christ the Redeemer':'Tượng Chúa Cứu Thế',
  'Sydney Opera House':'Nhà hát Opera Sydney', 'Turtle Tower':'Tháp Rùa', 'The Moon':'Mặt Trăng', Earth:'Trái Đất', Mars:'Sao Hỏa', Saturn:'Sao Thổ', Sun:'Mặt Trời'
});
const VI_PARTS = Object.freeze({
  'Frontal lobe':'Thùy trán','Temporal lobe':'Thùy thái dương','Parietal lobe':'Thùy đỉnh','Occipital lobe':'Thùy chẩm','Cerebellum':'Tiểu não','Brain stem':'Thân não','Brainstem':'Thân não','Corpus callosum':'Thể chai','Hippocampus':'Hồi hải mã','Amygdala':'Hạch hạnh nhân','Thalamus':'Đồi thị','Hypothalamus':'Vùng dưới đồi','Pituitary gland':'Tuyến yên','Pineal gland':'Tuyến tùng','Ventricles':'Não thất','Cerebrum':'Đại não','Cortex':'Vỏ não','Meninges':'Màng não',
  'Left atrium':'Tâm nhĩ trái','Right atrium':'Tâm nhĩ phải','Left ventricle':'Tâm thất trái','Right ventricle':'Tâm thất phải','Aorta':'Động mạch chủ','Pulmonary artery':'Động mạch phổi','Pulmonary veins':'Tĩnh mạch phổi','Vena cava':'Tĩnh mạch chủ','Coronary arteries':'Động mạch vành','Mitral valve':'Van hai lá','Tricuspid valve':'Van ba lá','Aortic valve':'Van động mạch chủ','Pulmonary valve':'Van động mạch phổi',
  'Engine block':'Thân động cơ','Cylinder head':'Nắp xi-lanh','Cylinder':'Xi-lanh','Piston':'Pít-tông','Piston rings':'Xéc-măng','Connecting rod':'Thanh truyền','Crankshaft':'Trục khuỷu','Camshaft':'Trục cam','Intake valve':'Van nạp','Exhaust valve':'Van xả','Spark plug':'Bugi','Fuel injector':'Kim phun nhiên liệu','Intake manifold':'Cổ góp nạp','Exhaust manifold':'Cổ góp xả','Turbocharger':'Bộ tăng áp turbo','Intercooler':'Bộ làm mát khí nạp','Supercharger':'Bộ siêu nạp','Flywheel':'Bánh đà','Oil pump':'Bơm dầu','Oil pan':'Các-te dầu','Timing chain':'Xích cam','Timing belt':'Dây đai cam','Radiator':'Két tản nhiệt','Alternator':'Máy phát điện','Starter motor':'Mô-tơ khởi động','Fan':'Quạt','Fan blades':'Cánh quạt','Compressor':'Máy nén','Combustor':'Buồng đốt','Turbine':'Tua-bin','Nozzle':'Vòi phun','Rotor':'Rô-to','Stator':'Sta-to','Gearbox':'Hộp số','Clutch':'Ly hợp','Brake disc':'Đĩa phanh','Brake caliper':'Cùm phanh','Wheel':'Bánh xe','Tire':'Lốp xe','Rim':'Vành bánh xe','Suspension':'Hệ thống treo','Door':'Cửa','Window':'Cửa sổ','Windshield':'Kính chắn gió','Chassis':'Khung gầm','Body':'Thân xe','Battery':'Pin','Motor':'Động cơ điện','Electric motor':'Động cơ điện','Wrist':'Cổ tay','Thumb':'Ngón cái','Index finger':'Ngón trỏ','Middle finger':'Ngón giữa','Ring finger':'Ngón áp út','Pinky':'Ngón út','Hand bones':'Xương bàn tay','Radius':'Xương quay','Ulna':'Xương trụ','Femur':'Xương đùi','Tibia':'Xương chày','Fibula':'Xương mác','Spine':'Cột sống','Rib cage':'Lồng ngực','Pelvis':'Xương chậu','Skull':'Hộp sọ','Heart':'Tim','Lungs':'Phổi','Liver':'Gan','Kidney':'Thận','Stomach':'Dạ dày','Intestines':'Ruột','Eye':'Mắt','Ear':'Tai','Nose':'Mũi','Brain':'Não'
});
const VI_WORDS = Object.freeze({ left:'trái', right:'phải', upper:'trên', lower:'dưới', back:'sau', front:'trước', inner:'bên trong', outer:'bên ngoài', assembly:'cụm', housing:'vỏ', cover:'nắp', plate:'tấm', shaft:'trục', bearing:'ổ bi', bolt:'bu-lông', screw:'vít', spring:'lò xo', gear:'bánh răng', gears:'bánh răng', pipe:'ống dẫn', hose:'ống mềm', line:'đường dẫn', sensor:'cảm biến', wire:'dây điện', wiring:'hệ dây điện', cable:'cáp', connector:'đầu nối', module:'mô-đun', support:'giá đỡ', mount:'bệ đỡ', bracket:'giá bắt', frame:'khung', shell:'vỏ', panel:'tấm ốp', valve:'van', pump:'bơm', system:'hệ thống', chamber:'buồng', chambered:'có buồng', chamber:'buồng', layer:'lớp', section:'phần', part:'bộ phận', main:'chính', small:'nhỏ', large:'lớn', primary:'chính', secondary:'phụ', control:'điều khiển', pressure:'áp suất', power:'năng lượng', fuel:'nhiên liệu', air:'không khí', water:'nước', blood:'máu', oxygen:'ô-xy', flow:'dòng chảy', cooling:'làm mát', intake:'nạp', exhaust:'xả', engine:'động cơ', motor:'động cơ', electric:'điện', mechanical:'cơ khí', rotating:'quay', rotation:'chuyển động quay', assembly:'cụm', valve:'van', pump:'bơm' });
const viCategory = (s) => VI_CATEGORIES[s] || s || '';
const viModel = (s) => VI_MODELS[s] || s || '';
const viPart = (s) => {
  const raw = String(s || '').trim(); if (VI_PARTS[raw]) return VI_PARTS[raw];
  const m = raw.match(/\s*\((L|R|left|right|upper|lower|back)\)$/i), base = m ? raw.slice(0, m.index).trim() : raw;
  let out = VI_PARTS[base] || base;
  if (out === base) out = base.replace(/\b[A-Za-z][A-Za-z'-]*\b/g, (w) => VI_WORDS[w.toLowerCase()] || w);
  if (m) out += ' (' + (({ L:'trái', R:'phải', left:'trái', right:'phải', upper:'trên', lower:'dưới', back:'sau' })[m[1]] || m[1]) + ')';
  return out;
};
const VI_FACTS = Object.freeze({ 'Human Brain':'Bộ não điều phối cảm giác, vận động, trí nhớ và tư duy.', 'Human Heart':'Tim bơm máu đi khắp cơ thể qua hệ tuần hoàn.', 'Human Kidney':'Thận lọc máu và điều hòa cân bằng dịch trong cơ thể.', Kidney:'Thận lọc máu và giúp điều hòa nước, muối khoáng.', Lungs:'Phổi trao đổi ô-xy và khí cacbonic khi hô hấp.', 'Human Eye':'Mắt tiếp nhận ánh sáng và chuyển tín hiệu hình ảnh về não.', 'Human Ear':'Tai hỗ trợ nghe và giữ thăng bằng.', Skull:'Hộp sọ bảo vệ não và các cấu trúc quan trọng.', Skeleton:'Bộ xương nâng đỡ cơ thể và bảo vệ các cơ quan.', 'Human Body':'Mô hình cơ thể người với các hệ cơ quan chính.', 'DNA Double Helix':'ADN lưu trữ thông tin di truyền trong tế bào.', 'Animal Cell':'Tế bào động vật gồm các cấu trúc thực hiện chức năng sống.', 'Sports Car':'Mô hình siêu xe với các cụm cơ khí có thể bung tách.', 'Motorcycle':'Mô hình xe mô tô gồm khung, bánh xe và cụm truyền động.', 'Turbofan Jet Engine':'Động cơ phản lực tạo lực đẩy bằng luồng khí tốc độ cao.', 'Mechanical Watch':'Đồng hồ cơ dùng hệ bánh răng và lò xo để đo thời gian.', 'EV Battery Pack':'Bộ pin lưu trữ và cung cấp năng lượng cho xe điện.', 'Eiffel Tower':'Tháp Eiffel là công trình biểu tượng của Paris, Pháp.', 'Great Pyramid':'Đại kim tự tháp Giza là di tích cổ đại ở Ai Cập.', 'Turtle Tower':'Tháp Rùa nằm trên hồ Hoàn Kiếm ở Hà Nội.' });
const viFact = (s, name = '') => VI_FACTS[name] || (name ? 'Mô hình ' + viModel(name).toLowerCase() + ' có thể xoay, thu phóng và khám phá chi tiết bằng cử chỉ tay.' : 'Mô hình 3D tương tác — dùng cử chỉ tay để xoay và khám phá chi tiết.');
const viInfo = (s) => {
  if (!String(s || '').trim()) return '';
  let out = String(s);
  const phrases = [
    [/is responsible for/gi,'có nhiệm vụ'],[/are responsible for/gi,'có nhiệm vụ'],[/helps to/gi,'giúp'],[/used to/gi,'được dùng để'],[/part of/gi,'một phần của'],[/made up of/gi,'được tạo thành từ'],[/in order to/gi,'để'],[/is made of/gi,'được làm từ'],[/are made of/gi,'được làm từ'],[/allows the/gi,'cho phép'],[/used for/gi,'được dùng cho']
  ];
  for (const [re, value] of phrases) out = out.replace(re, value);
  const terms = [
    ['connecting rod','thanh truyền'],['cylinder head','nắp xi-lanh'],['engine block','thân động cơ'],['fuel injector','kim phun nhiên liệu'],['intake manifold','cổ góp nạp'],['exhaust manifold','cổ góp xả'],['pulmonary artery','động mạch phổi'],['pulmonary veins','tĩnh mạch phổi'],['left ventricle','tâm thất trái'],['right ventricle','tâm thất phải'],['left atrium','tâm nhĩ trái'],['right atrium','tâm nhĩ phải'],['coronary arteries','động mạch vành'],['mitral valve','van hai lá'],['tricuspid valve','van ba lá'],['brain stem','thân não'],['corpus callosum','thể chai'],['frontal lobe','thùy trán'],['temporal lobe','thùy thái dương'],['parietal lobe','thùy đỉnh'],['occipital lobe','thùy chẩm'],['piston rings','xéc-măng'],['timing chain','xích cam'],['timing belt','dây đai cam'],['brake caliper','cùm phanh'],['brake disc','đĩa phanh'],['turbocharger','bộ tăng áp turbo'],['supercharger','bộ siêu nạp'],['starter motor','mô-tơ khởi động'],['electric motor','động cơ điện'],['cooling system','hệ thống làm mát'],['fuel system','hệ thống nhiên liệu'],['air pressure','áp suất không khí'],['spark plug','bugi'],['crankshaft','trục khuỷu'],['camshaft','trục cam'],['compressor','máy nén'],['combustor','buồng đốt'],['turbine','tua-bin'],['radiator','két tản nhiệt'],['alternator','máy phát điện'],['gearbox','hộp số'],['flywheel','bánh đà'],['connecting','kết nối'],['protects','bảo vệ'],['pumps','bơm'],['filters','lọc'],['carries','vận chuyển'],['transports','vận chuyển'],['connects','kết nối'],['controls','điều khiển'],['supports','nâng đỡ'],['stores','lưu trữ'],['produces','tạo ra'],['converts','chuyển đổi'],['supplies','cung cấp'],['contains','chứa'],['allows','cho phép'],['moves','di chuyển'],['draws','hút'],['compresses','nén'],['mixes','trộn'],['ignites','đốt cháy'],['cools','làm mát'],['regulates','điều chỉnh'],['delivers','truyền'],['transfers','truyền'],['rotates','quay'],['reduces','giảm'],['increases','tăng'],['creates','tạo'],['forms','tạo thành'],['blood','máu'],['oxygen','ô-xy'],['air','không khí'],['fuel','nhiên liệu'],['water','nước'],['pressure','áp suất'],['energy','năng lượng'],['engine','động cơ'],['valve','van'],['pump','bơm'],['shaft','trục'],['bearing','ổ bi'],['sensor','cảm biến'],['spring','lò xo'],['gear','bánh răng'],['cylinder','xi-lanh'],['piston','pít-tông'],['rotor','rô-to'],['stator','sta-to'],['fan','quạt'],['turbine','tua-bin'],['body','cơ thể'],['brain','não'],['heart','tim'],['lungs','phổi'],['lung','phổi'],['bone','xương'],['muscle','cơ'],['nerve','dây thần kinh'],['artery','động mạch'],['vein','tĩnh mạch'],['part','bộ phận'],['system','hệ thống'],['main','chính'],['outer','bên ngoài'],['inner','bên trong'],['left','trái'],['right','phải'],['upper','trên'],['lower','dưới'],['front','trước'],['back','sau']
  ];
  for (const [en, vi] of terms) out = out.replace(new RegExp('\\b' + en + '\\b', 'gi'), vi);
  const glue = [[/\bthe\b/gi,''],[/\ba\b/gi,''],[/\ban\b/gi,''],[/\band\b/gi,'và'],[/\bor\b/gi,'hoặc'],[/\bwith\b/gi,'với'],[/\bfrom\b/gi,'từ'],[/\binto\b/gi,'vào'],[/\bthrough\b/gi,'qua'],[/\bbetween\b/gi,'giữa'],[/\binside\b/gi,'bên trong'],[/\boutside\b/gi,'bên ngoài'],[/\bduring\b/gi,'trong quá trình'],[/\bfor\b/gi,'cho'],[/\bof\b/gi,'của'],[/\bin\b/gi,'trong'],[/\bon\b/gi,'trên'],[/\bto\b/gi,'đến'],[/\bis\b/gi,'là'],[/\bare\b/gi,'là'],[/\bhas\b/gi,'có'],[/\bhave\b/gi,'có'],[/\bthis\b/gi,'này'],[/\bthese\b/gi,'những'],[/\bwhich\b/gi,'mà'],[/\bthat\b/gi,'mà']];
  for (const [re, value] of glue) out = out.replace(re, value);
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').trim() || 'Bộ phận mô phỏng trong mô hình 3D.';
};
const VI_UI = Object.freeze({
  'snap · form · explode — with your hand':'chụm tay · tạo hình · bung tách bằng cử chỉ','Scene':'Trạng thái','Hand':'Tư thế tay','Gesture sensitivity':'Độ nhạy cử chỉ','Standard':'Chuẩn','More forgiving':'Dễ nhận diện hơn','More forgiving helps recognize less distinct hand poses.':'Chế độ này giúp nhận diện những tư thế tay chưa rõ nét.','Hand openness':'Độ mở bàn tay','Exploded view':'Chế độ bung tách','Open your hand to pull it apart · close it to assemble':'Xòe tay để tách bộ phận · nắm tay để lắp lại',
  'Gestures':'Cử chỉ','Snap':'Tụ hạt','Form':'Tạo hình','Release':'Bung tách','Next':'Tiếp theo','Part':'Bộ phận','Pull out':'Tách ra','Read aloud':'Đọc mô tả','Point ☝ at another part · pinch 🤏 to pull it out':'Chỉ ☝ vào bộ phận khác · chụm 🤏 để kéo ra',
  'Controls':'Điều khiển','Snap — summon / dissolve':'Tụ hạt / làm tan','Fist (form) / Open hand (release)':'Nắm tay (tạo hình) / xòe tay (bung tách)','Next / previous model':'Mô hình tiếp theo / trước đó','Exploded view (engines & car)':'Bung tách (động cơ và xe)','Rotate the model':'Xoay mô hình','Pick a part (or click it) · pull it out':'Chọn bộ phận (hoặc nhấn) · kéo ra','Zoom (also':'Thu phóng (cũng dùng được','Cut-away slice (move hand / mouse)':'Cắt lớp (di chuyển tay / chuột)','Quiz · voice · record video · describe part':'Đố vui · giọng nói · quay video · mô tả bộ phận','Auto-rotate · labels · trails':'Tự xoay · nhãn · vệt sáng','Camera · demo · this help':'Camera · trình diễn · trợ giúp',
  'Glowing 3D wonders, the human body (brain, beating heart, breathing lungs, eye, ear, skeleton…), DNA, a cell, engines, vehicles and machines made of up to a quarter-million light particles — controlled by your hand in front of the webcam.':'Kỳ quan 3D phát sáng, cơ thể người (não, tim đập, phổi hô hấp, mắt, tai, bộ xương…), ADN, tế bào, động cơ, phương tiện và máy móc được tạo từ hàng trăm nghìn hạt sáng — điều khiển bằng bàn tay trước camera.',
  'Snap your fingers to summon the particles.':'Chụm/ngắt ngón tay để triệu hồi các hạt sáng.','Make a fist to form a wonder, engine or car.':'Nắm tay để lắp thành kỳ quan, động cơ hoặc xe.','Open your hand: wonders morph to the next one — organs, engines and the car explode to show every part inside, named with what it does. Close your hand to put it back together.':'Xòe tay: chuyển sang kỳ quan kế tiếp; các cơ quan, động cơ và xe sẽ bung tách để hiển thị từng bộ phận. Nắm tay để lắp chúng lại.','Twist your hand to turn the model, raise or lower it to tilt; two hands zoom.':'Xoay cổ tay để xoay mô hình, nâng/hạ tay để nghiêng; dùng hai tay để thu phóng và xoay kiểu không gian.','Point ☝ at a part to learn what it does, pinch 🤏 to pull it out. Try the 🎓 quiz, 🎤 voice, ✂ cut-away and ⏺ recording.':'Chỉ ☝ vào bộ phận để xem thông tin; chụm 🤏 để chọn và kéo bộ phận ra, rồi di chuyển tay để điều khiển vị trí. Thử đố vui 🎓, giọng nói 🎤, cắt lớp ✂ và quay ⏺.','Show ✌ to jump to the next model.':'Giơ ✌ để chuyển sang mô hình tiếp theo.',
  'Start with camera':'Bắt đầu với camera','Continue without camera':'Tiếp tục không dùng camera','Requesting camera…':'Đang yêu cầu quyền camera…','Loading hand tracker…':'Đang tải bộ nhận diện bàn tay…','Speech recognition is not available here: parts are still read aloud':'Trình duyệt không hỗ trợ nhận dạng giọng nói; vẫn có thể đọc mô tả bộ phận','Recording is not supported in this browser':'Trình duyệt này không hỗ trợ quay video','Cut-away off':'Đã tắt chế độ cắt lớp','Recording…':'Đang quay…','Voice off':'Đã tắt giọng nói'
});
const viUI = (s) => VI_UI[s] || s || '';
const isThumbsUp = (lm) => {
  if (!lm || lm.length < 21) return false;
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const thumbUp = lm[4][1] < lm[3][1] - 0.035 && d(lm[4], lm[0]) > d(lm[3], lm[0]) * 1.05;
  const tips = [8, 12, 16, 20], pips = [6, 10, 14, 18];
  return thumbUp && tips.every((tip, i) => d(lm[tip], lm[0]) < d(lm[pips[i]], lm[0]) * 1.1);
};
`;

const DRAW_HAND_OLD = `  drawHand(g, lm, col, dpr) {
    const P = lm.map((p) => this.toScreen(p));
    g.lineWidth = 2 * dpr; g.strokeStyle = col; g.globalAlpha = 0.75; g.shadowColor = col; g.shadowBlur = 10 * dpr;
    g.beginPath();
    for (const [a, b] of HAND_EDGES) { g.moveTo(P[a][0], P[a][1]); g.lineTo(P[b][0], P[b][1]); }
    g.stroke();
    g.fillStyle = '#fff'; g.globalAlpha = 0.9;
    for (const p of P) { g.beginPath(); g.arc(p[0], p[1], 2.6 * dpr, 0, Math.PI * 2); g.fill(); }
    return P;
  }`;
const DRAW_HAND_NEW = `  drawHand(g, lm, col, dpr) {
    const P = lm.map((p) => this.toScreen(p)), pulse = 0.92 + 0.08 * Math.sin((this.t || 0) * 5);
    // Palm triangulation plus the anatomical edges creates a distinct holographic scan skeleton.
    g.save(); g.globalCompositeOperation = 'lighter'; g.shadowColor = col; g.shadowBlur = 14 * dpr;
    g.strokeStyle = col; g.lineWidth = 1.7 * dpr; g.globalAlpha = 0.62;
    g.beginPath();
    for (const [a, b] of HAND_EDGES) { g.moveTo(P[a][0], P[a][1]); g.lineTo(P[b][0], P[b][1]); }
    for (const [a, b] of [[0,5],[0,9],[0,13],[0,17],[5,9],[5,13],[5,17],[9,13],[9,17],[13,17]]) { g.moveTo(P[a][0], P[a][1]); g.lineTo(P[b][0], P[b][1]); }
    g.stroke();
    // Double-stroke the high-energy silhouette.
    g.globalAlpha = 0.36; g.lineWidth = 3.6 * dpr; g.beginPath();
    for (const [a, b] of HAND_EDGES) { g.moveTo(P[a][0], P[a][1]); g.lineTo(P[b][0], P[b][1]); }
    g.stroke();
    // Concentric joint reticles: wrist and palm anchors are larger than finger nodes.
    for (let i = 0; i < P.length; i++) {
      const [x, y] = P[i], major = [0,5,9,13,17].includes(i), r = (major ? 5.4 : 2.6) * dpr * pulse;
      g.strokeStyle = major ? '#8ff8ff' : col; g.globalAlpha = major ? 0.82 : 0.55; g.lineWidth = (major ? 1.25 : 0.8) * dpr;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
      if (major) { g.globalAlpha = 0.18; g.beginPath(); g.arc(x, y, r * 2.1, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = i === 0 ? '#ffd27a' : '#e4ffff'; g.globalAlpha = 0.94; g.beginPath(); g.arc(x, y, (major ? 2.1 : 1.4) * dpr, 0, Math.PI * 2); g.fill();
    }
    // Wrist energy cuff, inspired by a sci-fi HUD without copying any film asset.
    const w = P[0]; g.translate(w[0], w[1]); g.rotate(Math.atan2(P[9][1] - w[1], P[9][0] - w[0]));
    g.strokeStyle = '#62eaff'; g.lineWidth = 1.2 * dpr; g.globalAlpha = 0.72; g.beginPath(); g.ellipse(0, 0, 11 * dpr, 5 * dpr, 0, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 0.48; g.beginPath(); g.ellipse(0, 0, 15 * dpr, 7.5 * dpr, 0, 0, Math.PI * 2); g.stroke();
    g.restore(); return P;
  }`;

export function patchWonderSnapApp(source, { fpsPatch } = {}) {
  if (!source.includes("const CATEGORIES = [...new Set(CATALOG.map((d) => d.category))];")) throw new Error('WonderSnap localization insertion point changed upstream');
  source = replaceOnce(source, "const CATEGORIES = [...new Set(CATALOG.map((d) => d.category))];", "const CATEGORIES = [...new Set(CATALOG.map((d) => d.category))];\n" + I18N, 'Vietnamese localization helpers');
  source = replaceOnce(source, DRAW_HAND_OLD, DRAW_HAND_NEW, 'holographic hand skeleton');

  source = replaceOnce(source,
    "      const m = { ...d, def: CATALOG[d.index] };",
    "      const m = { ...d, def: CATALOG[d.index] };\n      if (Array.isArray(m.labels)) m.labels = m.labels.map((part) => ({ ...part, label: viPart(part.label), info: viInfo(part.info) }));",
    'Vietnamese model-part labels');

  source = replaceOnce(source,
    "      b.textContent = `${c} · ${CATALOG.filter((d) => d.category === c).length}`; b.dataset.cat = c;",
    "      b.textContent = `${viCategory(c)} · ${CATALOG.filter((d) => d.category === c).length}`; b.dataset.cat = c;",
    'localized category buttons');
  source = replaceOnce(source,
    "      b.innerHTML = `<i style=\"color:${rgbCss(d.color)};background:${rgbCss(d.color)}\"></i>${d.name}`;",
    "      b.innerHTML = `<i style=\"color:${rgbCss(d.color)};background:${rgbCss(d.color)}\"></i>${viModel(d.name)}`;",
    'localized model selector');
  source = replaceOnce(source,
    "      $('cat').textContent = def.category; $('name').textContent = def.name; $('fact').textContent = def.fact || '';\n      $('bigTitle').querySelector('.t').textContent = def.name; $('bigTitle').querySelector('.s').textContent = def.fact || '';",
    "      $('cat').textContent = viCategory(def.category); $('name').textContent = viModel(def.name); $('fact').textContent = viFact(def.fact || '', def.name);\n      $('bigTitle').querySelector('.t').textContent = viModel(def.name); $('bigTitle').querySelector('.s').textContent = viFact(def.fact || '', def.name);",
    'localized active model title');

  source = replaceOnce(source,
    "const POSE_UI = { [OPEN]: ['✋', 'Open hand'], [FIST]: ['✊', 'Fist'], [PEACE]: ['✌', 'Peace'], [POINT]: ['☝', 'Pointing'], other: ['🤚', 'Moving'], [NONE]: ['·', 'No hand'] };",
    "const POSE_UI = { [OPEN]: ['✋', 'Xòe tay'], [FIST]: ['✊', 'Nắm tay'], [PEACE]: ['✌', 'Chữ V'], [POINT]: ['☝', 'Chỉ tay'], other: ['🤚', 'Đang di chuyển'], [NONE]: ['·', 'Chưa thấy tay'], [THUMBS_UP]: ['👍', 'Giơ ngón cái'] };",
    'localized hand pose labels');
  source = source.replace("const [emo, label] = pose === 'pinch' ? ['🤏', 'Pinch'] : POSE_UI[pose] || POSE_UI.other;", "const [emo, label] = pose === 'pinch' ? ['🤏', 'Chụm ngón'] : POSE_UI[pose] || POSE_UI.other;");

  const oldGuide = `    return [
      ['snap', '🫰', '<b>Snap</b> — summon particles / dissolve'],
      ['fist', '✊', machine ? '<b>Fist</b> — put it together' : '<b>Fist</b> — form the wonder'],
      ['open', '✋', machine ? '<b>Open slowly</b> — explode it, see inside' : '<b>Open hand</b> — morph to the next wonder'],
      ['twist', '🔄', '<b>Twist / raise hand</b> — rotate & tilt it'],
      ...(machine ? [['point', '☝', '<b>Point</b> at a part to learn it · <b>pinch</b> 🤏 pulls it out']] : []),
      ['zoom', '🙌', '<b>Two hands</b> apart / together — zoom'],
      ['peace', '✌', '<b>Peace</b> — jump to the next model'],
    ];`;
  const newGuide = `    return [
      ['snap', '🫰', '<b>Chụm/ngắt ngón</b> — triệu hồi / làm tan hạt sáng'],
      ['fist', '✊', machine ? '<b>Nắm tay</b> — lắp các bộ phận lại' : '<b>Nắm tay</b> — tạo hình mô hình'],
      ['open', '✋', machine ? '<b>Xòe tay</b> — bung tách mô hình để xem bên trong' : '<b>Xòe tay</b> — chuyển sang kỳ quan tiếp theo'],
      ['twist', '🔄', '<b>Xoay cổ tay / nâng hạ tay</b> — xoay và nghiêng mô hình'],
      ...(machine ? [['point', '☝', '<b>Chỉ tay</b> vào bộ phận để xem mô tả · <b>chụm ngón</b> 🤏 để kéo bộ phận ra và rê tay để di chuyển']] : []),
      ['zoom', '🙌', '<b>Hai tay</b> dang ra / khép lại để thu phóng; xoay đường nối hai tay để xoay mô hình'],
      ['peace', '✌', '<b>Chữ V</b> — chuyển mô hình tiếp theo'],
      ['repulsor', '⚡', '<b>Xòe tay rồi đẩy/vuốt nhanh</b> — phát xung lực năng lượng kiểu HUD khoa học viễn tưởng'],
      ['shield', '🛡️', '<b>Giơ hai ngón cái và giữ</b> khoảng 0,55 giây — bật khiên năng lượng hologram'],
    ];`;
  source = replaceOnce(source, oldGuide, newGuide, 'Vietnamese gesture guide');
  source = replaceOnce(source, "    el.textContent = msg; el.classList.add('show');", "    el.textContent = viUI(msg); el.classList.add('show');", 'localized toast messages');
  source = replaceOnce(source, "    if (pill.dataset.state !== st.state) { pill.dataset.state = st.state; pill.textContent = st.state; }", "    if (pill.dataset.state !== st.state) { pill.dataset.state = st.state; pill.textContent = ({ idle:'Chờ', sphere:'Tụ hạt', formed:'Đã tạo hình', dissolve:'Đang tan' })[st.state] || st.state; }", 'localized scene state');
  source = source.replace("g.fillText('✂ cross-section',", "g.fillText('✂ Mặt cắt',");
  source = source.replace("g.fillText(`🔍 zoom ${this.zoom.toFixed(2)}×`,", "g.fillText(`🔍 thu phóng ${this.zoom.toFixed(2)}×`,");
  source = source.replace("done.push(a.name)", "done.push(viModel(a.name))");
  source = source.replace("this.toast(this.cut.on ? '✂ Cut-away: move your hand (or the mouse) left / right' : '✂ Cut-away off')", "this.toast(this.cut.on ? '✂ Cắt lớp: di chuyển tay (hoặc chuột) sang trái / phải' : '✂ Đã tắt cắt lớp')");
  source = source.replace("this.say(`Quiz finished. You scored ${q.score} out of ${q.total}.`)", "this.say(`Đã hoàn thành đố vui. Điểm của bạn: ${q.score}/${q.total}.`)");
  source = source.replace("this.say(`Find the ${this.model.labels[q.target].label}`)", "this.say(`Hãy tìm bộ phận ${this.model.labels[q.target].label}`)");
  source = source.replace("q.feedback = ok ? `✅ Correct! ${L[li].label}: ${L[li].info}` : `❌ That's the ${L[li].label}. Here is the ${L[q.target].label}.`;", "q.feedback = ok ? `✅ Chính xác! ${L[li].label}: ${L[li].info}` : `❌ Đây là ${L[li].label}. Bộ phận đúng là ${L[q.target].label}.`;");
  source = source.replace("this.say(ok ? `Correct! ${L[li].info}` : `No, that's the ${L[li].label}.`)", "this.say(ok ? `Chính xác! ${L[li].info}` : `Chưa đúng, đây là ${L[li].label}.`)");
  const uiSourcePairs = [
    ["`🎤 “${text}”${done.length ? ' → ' + done.join(', ') : ' (not understood)'}`", "`🎤 Đã nghe: “${text}”${done.length ? ' → ' + done.join(', ') : ' (chưa hiểu)'}`"],
    ["'🫰 Snap! Particles summoned'", "'🫰 Đã triệu hồi các hạt sáng'"],
    ["`✌ Next: ${name}`", "`✌ Tiếp theo: ${viModel(name)}`"],
    ["`→ ${name}`", "`→ ${viModel(name)}`"],
    ["'💥 Dissolved'", "'💥 Đã làm tan mô hình'"],
    ["`🔄 Hand rotation ${this.handRotate ? 'on' : 'off'}`", "`🔄 Xoay bằng tay ${this.handRotate ? 'đã bật' : 'đã tắt'}`"],
    ["'📷 Camera on — snap your fingers!'", "'📷 Camera đã bật — chụm/ngắt ngón tay để bắt đầu'"],
    ["'Camera off'", "'Đã tắt camera'"],
    ["'▶ Demo — synthetic hand'", "'▶ Trình diễn — bàn tay mô phỏng'"],
    ["'Keyboard: Space = snap · F = fist · O = open · E = explode · D = demo · H = help'", "'Phím tắt: Space = tụ hạt · F = nắm tay · O = xòe tay · E = bung tách · D = trình diễn · H = trợ giúp'"]
  ];
  for (const [from, to] of uiSourcePairs) source = source.replace(from, to);
  for (const [from, to] of [["done.push('explode')","done.push('bung tách')"],["done.push('assemble')","done.push('lắp lại')"],["done.push('next')","done.push('tiếp theo')"],["done.push('previous')","done.push('quay lại')"],["done.push('snap')","done.push('triệu hồi')"],["done.push('dissolve')","done.push('làm tan')"],["done.push('quiz')","done.push('đố vui')"],["done.push('stop quiz')","done.push('dừng đố vui')"],["done.push('cut')","done.push('cắt lớp')"],["done.push('zoom in')","done.push('phóng to')"],["done.push('zoom out')","done.push('thu nhỏ')"],["done.push('rotate')","done.push('xoay')"],["done.push('record')","done.push('ghi hình')"],["done.push('describe')","done.push('mô tả')"]]) source = source.replace(from, to);

  // Part pull vector follows the pinched hand in screen-space; the release point remains the new anchor.
  source = replaceOnce(source,
    "    if (ctl.pinchStart) {\n      ctl.pinchStart = false;\n      if (this.sel >= 0) { this.pulled = !this.pulled; this.toast(this.pulled ? `🤏 Pulled out: ${this.model.labels[this.sel].label}` : '🤏 Put back'); }\n    }",
    "    if (ctl.pinchStart) {\n      ctl.pinchStart = false;\n      if (this.sel < 0 && ctl.landmarks) {\n        const p = this.toScreen([(ctl.landmarks[4][0] + ctl.landmarks[8][0]) / 2, (ctl.landmarks[4][1] + ctl.landmarks[8][1]) / 2]);\n        const li = this.nearestAnchor(p[0], p[1], 145 * dpr);\n        if (li >= 0) { this.selectPart(li, 'pinch'); this.pulled = true; this.pullVec = [0, 0, 0.65]; this.toast(`🤏 Đã gắp ${this.model.labels[li].label}; di chuyển tay để kéo bộ phận`); }\n      } else if (this.sel >= 0) { this.pulled = !this.pulled; if (!this.pulled) this.pullVec = [0, 0, 0.5]; this.toast(this.pulled ? `🤏 Đã tách: ${this.model.labels[this.sel].label}` : '🤏 Đã lắp bộ phận trở lại'); }\n    }",
    'pinch-select and hand-following part pull');
  source = replaceOnce(source,
    "      if (li === this.sel) w[2] += 0.5 * this.pullAmt;",
    "      if (li === this.sel) { w[0] += this.pullVec[0] * this.pullAmt; w[1] += this.pullVec[1] * this.pullAmt; w[2] += this.pullVec[2] * this.pullAmt; }",
    'part anchor follows pull vector');
  source = replaceOnce(source,
    "    this.pullAmt += ((this.pulled && this.sel >= 0 ? 1 : 0) - this.pullAmt) * (1 - Math.exp(-dt * 6));",
    "    if (this.pulled && this.sel >= 0 && ctl.pinch && ctl.landmarks) { this.pullVec[0] = clamp((ctl.handX - 0.5) * 1.5, -0.9, 0.9); this.pullVec[1] = clamp((0.5 - ctl.handY) * 1.5, -0.9, 0.9); this.pullVec[2] = 0.65; }\n    this.pullAmt += ((this.pulled && this.sel >= 0 ? 1 : 0) - this.pullAmt) * (1 - Math.exp(-dt * 8));",
    'low-latency pull follow');
  source = replaceOnce(source,
    "pull: [0, 0, 0.5 * this.pullAmt]",
    "pull: this.pullVec.map((v) => v * this.pullAmt)",
    'world-space part pull');

  source = replaceOnce(source,
    "    this.sel = -1; this.pulled = false; this.pullAmt = 0; this.hover = { li: -1, t0: 0 };",
    "    this.sel = -1; this.pulled = false; this.pullAmt = 0; this.pullVec = [0, 0, 0.5]; this.hover = { li: -1, t0: 0 };",
    'pull vector initialization');
  source = replaceOnce(source,
    "        this.manualExplode = this.quiz ? 1 : 0; this.sel = -1; this.pulled = false; this.zoomTarget = 1; this.prefetch();",
    "        this.manualExplode = this.quiz ? 1 : 0; this.sel = -1; this.pulled = false; this.pullVec = [0, 0, 0.5]; this.zoomTarget = 1; this.prefetch();",
    'reset pull vector on model change');

  // Two-hand pinch-distance zoom plus roll of the line joining both palms = 3D turn;
  // raising/lowering both palms adds pitch without fighting the single-hand twist.
  const oldZoom = `    if (twoHands) {
      const a = ctl.landmarks[9], b = ctl.second[9], spread = Math.hypot((a[0] - b[0]) * ctl.aspect, a[1] - b[1]);
      if (!this.zoomGrab) this.zoomGrab = { spread: Math.max(spread, 0.02), zoom: this.zoomTarget };
      this.zoomTarget = clamp((this.zoomGrab.zoom * spread) / this.zoomGrab.spread, 0.5, 2.6);
    } else this.zoomGrab = null;`;
  const newZoom = `    if (twoHands) {
      const a = ctl.landmarks[9], b = ctl.second[9], dx = (b[0] - a[0]) * ctl.aspect, dy = b[1] - a[1];
      const spread = Math.hypot(dx, dy), angle = Math.atan2(dy, dx), centerY = (a[1] + b[1]) * 0.5;
      if (!this.zoomGrab) this.zoomGrab = { spread: Math.max(spread, 0.02), zoom: this.zoomTarget };
      if (!this.twoHandGrab) this.twoHandGrab = { angle, spin: this.spin, pitch: this.pitch, centerY };
      this.zoomTarget = clamp((this.zoomGrab.zoom * spread) / this.zoomGrab.spread, 0.35, 3.2);
      this.spin = this.twoHandGrab.spin - wrapPi(angle - this.twoHandGrab.angle) * 1.35;
      this.pitch = clamp(this.twoHandGrab.pitch + (this.twoHandGrab.centerY - centerY) * 1.65, -0.85, 0.85);
    } else { this.zoomGrab = null; this.twoHandGrab = null; }`;
  source = replaceOnce(source, oldZoom, newZoom, 'two-hand zoom and rotation');
  source = replaceOnce(source,
    "    this.zoom = 1; this.zoomTarget = 1; this.zoomGrab = null;",
    "    this.zoom = 1; this.zoomTarget = 1; this.zoomGrab = null; this.twoHandGrab = null; this.repulsor = { x: 0, y: 0, t: 0, valid: false, cooldown: 0, until: 0, kick: false }; this.shield = { holdAt: null, until: 0, cooldown: 0 };",
    'two-hand and repulsor state initialization');
  source = source.replace(/clamp\(([^\n;]*?), 0\.5, 2\.6\)/g, 'clamp($1, 0.35, 3.2)');
  source = source.replace('const HAND_YAW_GAIN = 2.2;', 'const HAND_YAW_GAIN = 2.65;');
  source = source.replace('const HAND_PITCH_GAIN = 2.5;', 'const HAND_PITCH_GAIN = 3.05;');

  const twoHandsAnchor = "    const twoHands = vis && ctl.secondVisible(t) && formed;";
  const repulsorCode = `    const twoHands = vis && ctl.secondVisible(t) && ready;

    // Repulsor-style pulse: a deliberate fast open-palm thrust produces a single particle impulse + HUD ripple.
    if (vis && ctl.pose === OPEN && ctl.landmarks) {
      const r = this.repulsor, dx = (ctl.handX - r.x) * ctl.aspect, dy = ctl.handY - r.y, elapsed = t - r.t, dist = Math.hypot(dx, dy);
      if (r.valid && elapsed > 0.018 && elapsed < 0.18 && dist > 0.12 && dist / elapsed > 1.45 && t >= r.cooldown) {
        r.until = t + 0.62; r.cooldown = t + 1.15; r.kick = true; this.toast('⚡ Xung lực năng lượng!');
      }
      r.x = ctl.handX; r.y = ctl.handY; r.t = t; r.valid = true;
    } else if (ctl.landmarks) { this.repulsor.x = ctl.handX; this.repulsor.y = ctl.handY; this.repulsor.t = t; this.repulsor.valid = true; }
    else this.repulsor.valid = false;
    const shieldHands = vis && ctl.secondVisible(t) && isThumbsUp(ctl.landmarks) && isThumbsUp(ctl.second);
    if (shieldHands) {
      if (this.shield.holdAt === null) this.shield.holdAt = t;
      if (t - this.shield.holdAt >= 0.55 && t >= this.shield.cooldown) { this.shield.until = t + 1.45; this.shield.cooldown = t + 3.0; this.shield.holdAt = null; this.repulsor.kick = true; this.toast('🛡️ Khiên năng lượng đã kích hoạt!'); }
    } else this.shield.holdAt = null;`;
  source = replaceOnce(source, twoHandsAnchor, repulsorCode, 'repulsor open-palm thrust detector');
  source = replaceOnce(source,
    "    const kick = st.consumeKick() ? 1 : 0;                                // one-frame impulse, read exactly once",
    "    const kick = (st.consumeKick() || this.repulsor.kick) ? 1 : 0; this.repulsor.kick = false; // one-frame snap or repulsor impulse",
    'repulsor particle impulse');

  // Futuristic hand-centred pulse ring, rendered only for a short cooldown window.
  const cutAnchor = "    if (!this.anchors.length) return;";
  const ring = `    if (this.repulsor?.until > t && lm) {
      const u = clamp(1 - (this.repulsor.until - t) / 0.62, 0, 1), c = this.toScreen([ctl.handX, ctl.handY]);
      const radius = (18 + u * 170) * dpr, alpha = (1 - u) * 0.9;
      g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = '#70efff'; g.shadowColor = '#48dfff'; g.shadowBlur = 22 * dpr; g.globalAlpha = alpha; g.lineWidth = 2.2 * dpr;
      g.beginPath(); g.arc(c[0], c[1], radius, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = alpha * 0.72; g.lineWidth = 1 * dpr; g.beginPath(); g.arc(c[0], c[1], radius * 0.72, -0.3, 1.2); g.stroke();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(c[0] + Math.cos(a) * radius * 0.78, c[1] + Math.sin(a) * radius * 0.78); g.lineTo(c[0] + Math.cos(a) * radius * 1.15, c[1] + Math.sin(a) * radius * 1.15); g.stroke(); }
      g.restore();
    }
    if (this.shield?.until > t) {
      const u = clamp(1 - (this.shield.until - t) / 1.45, 0, 1), c0 = project(this.projView, [0, 0, 0]);
      const cx = (c0[0] * 0.5 + 0.5) * W, cy = (0.5 - c0[1] * 0.5) * H, radius = this.globeRadiusPx() * (0.62 + 0.72 * u);
      g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = '#68edff'; g.shadowColor = '#55e4ff'; g.shadowBlur = 18 * dpr; g.globalAlpha = (1 - u) * 0.82; g.lineWidth = 1.8 * dpr;
      g.beginPath(); g.ellipse(cx, cy, radius, radius * 0.35, -0.12, 0, Math.PI * 2); g.stroke();
      g.globalAlpha *= 0.72; g.beginPath(); g.ellipse(cx, cy, radius * 0.78, radius * 0.28, 0.42, 0, Math.PI * 2); g.stroke();
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.beginPath(); g.moveTo(cx + Math.cos(a) * radius * 0.88, cy + Math.sin(a) * radius * 0.34); g.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius * 0.38); g.stroke(); }
      g.restore();
    }
    if (!this.anchors.length) return;`;
  source = replaceOnce(source, cutAnchor, ring, 'repulsor holographic ring');

  // Draw an angular, segmented target reticle while pointing. Dwell and selection logic remain the same.
  const pointerOld = `      g.strokeStyle = '#7dff9b'; g.lineWidth = 2 * dpr; g.globalAlpha = 0.9;
      g.beginPath(); g.arc(x, y, 14 * dpr, 0, Math.PI * 2); g.stroke();
      if (li >= 0) {
        g.lineWidth = 4 * dpr; g.beginPath(); g.arc(x, y, 20 * dpr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog); g.stroke();`;
  const pointerNew = `      g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = '#83f4ff'; g.shadowColor = '#4ee6ff'; g.shadowBlur = 12 * dpr; g.lineWidth = 1.4 * dpr; g.globalAlpha = 0.95;
      g.beginPath(); g.arc(x, y, 14 * dpr, -0.15, 1.9); g.stroke(); g.beginPath(); g.arc(x, y, 14 * dpr, 2.25, 4.2); g.stroke(); g.beginPath(); g.arc(x, y, 14 * dpr, 4.55, 6.13); g.stroke();
      g.beginPath(); g.moveTo(x - 22 * dpr, y); g.lineTo(x - 8 * dpr, y); g.moveTo(x + 8 * dpr, y); g.lineTo(x + 22 * dpr, y); g.moveTo(x, y - 22 * dpr); g.lineTo(x, y - 8 * dpr); g.moveTo(x, y + 8 * dpr); g.lineTo(x, y + 22 * dpr); g.stroke(); g.restore();
      if (li >= 0) {
        g.strokeStyle = '#ffd166'; g.shadowColor = '#ffd166'; g.shadowBlur = 10 * dpr; g.lineWidth = 3 * dpr; g.beginPath(); g.arc(x, y, 21 * dpr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog); g.stroke();`;
  source = replaceOnce(source, pointerOld, pointerNew, 'holographic pointer reticle');

  // Translate stable user-facing toasts; state and parser tokens remain canonical internally.
  const stringPairs = [
    ["'✂ cross-section'", "'✂ Mặt cắt'"],
    ["'Cut-away: move your hand (or the mouse) left / right'", "'Cắt lớp: di chuyển tay (hoặc chuột) sang trái / phải'"],
    ["'Cut-away off'", "'Đã tắt chế độ cắt lớp'"],
    ["'Recording is not supported in this browser'", "'Trình duyệt này không hỗ trợ quay video'"],
    ["'⏺ Recording…'", "'⏺ Đang quay video…'"],
    ["'🎤 Voice off'", "'🎤 Đã tắt giọng nói'"],
    ["'🎓 Quiz: point at the part I name'", "'🎓 Đố vui: chỉ vào bộ phận được gọi tên'"],
    ["'🎤 Listening: say “show me the heart”, “explode”, “next”, “quiz”…'", "'🎤 Đang nghe: nói “hiện trái tim”, “bung tách”, “tiếp theo”, “đố vui”…'"],
    ["'🎤 Speech recognition is not available here: parts are still read aloud'", "'🎤 Trình duyệt không hỗ trợ nhận dạng giọng nói; vẫn có thể đọc mô tả bộ phận'"],
    ["'🤏 Pulled out: ' + this.model.labels[this.sel].label", "'🤏 Đã tách: ' + this.model.labels[this.sel].label"],
    ["'🤏 Put back'", "'🤏 Đã lắp bộ phận trở lại'"],
    ["'Hand rotation ' + (this.handRotate ? 'on' : 'off')", "'Xoay bằng tay ' + (this.handRotate ? 'đã bật' : 'đã tắt')"],
    ["'Xòe tay'", "'Xòe tay'"],
  ];
  for (const [from, to] of stringPairs) source = source.replace(from, to);

  if (fpsPatch) {
    const fpsAnchor = "if (t - this._fpsT >= 1) { this.fps = this._fpsN / (t - this._fpsT); this._fpsN = 0; this._fpsT = t; }";
    source = replaceOnce(source, fpsAnchor, fpsPatch, 'FPS metrics postMessage');
  }
  return source;
}

export function patchWonderSnapGestures(source) {
  source = replaceOnce(source,
    "export const OPEN = 'open', FIST = 'fist', PEACE = 'peace', POINT = 'point', OTHER = 'other', NONE = 'none';",
    "export const OPEN = 'open', FIST = 'fist', PEACE = 'peace', POINT = 'point', THUMBS_UP = 'thumbs-up', OTHER = 'other', NONE = 'none';",
    'thumbs-up pose constant');
  source = replaceOnce(source,
    "  if (ext.every(Boolean) && thumbOut) return OPEN;\n  if (curled.every(Boolean)) return FIST;",
    "  if (ext.every(Boolean) && thumbOut) return OPEN;\n  const thumbRaised = lm[THUMB_TIP][1] < lm[3][1] - 0.035 && d(lm[THUMB_TIP], lm[WRIST]) > d(lm[3], lm[WRIST]) * 1.05;\n  if (thumbRaised && curled.every(Boolean)) return THUMBS_UP;\n  if (curled.every(Boolean)) return FIST;",
    'thumbs-up gesture classifier');
  return source;
}

export function localizeWonderSnapHtml(source) {
  const pairs = [
    ['<html lang="en">','<html lang="vi">'],
    ['<title>WonderSnap</title>','<title>WonderSnap · Điều khiển cử chỉ 3D</title>'],
    ['Gesture-controlled 3D models made of 200k glowing GPU particles.','Điều khiển mô hình 3D bằng cử chỉ tay với các hạt sáng GPU.'],
    ['snap · form · explode — with your hand','chụm tay · tạo hình · bung tách bằng cử chỉ'],
    ['>Scene<','>Trạng thái<'], ['>Wonders<','>Kỳ quan<'], ['<h1 id="name">Turtle Tower</h1>','<h1 id="name">Tháp Rùa</h1>'], ['>Hand<','>Tư thế tay<'], ['Gesture sensitivity','Độ nhạy cử chỉ'], ['>Standard<','>Chuẩn<'], ['>More forgiving<','>Dễ nhận diện hơn<'], ['More forgiving helps recognize less distinct hand poses.','Chế độ này giúp nhận diện những tư thế tay chưa rõ nét.'],
    ['>Hand openness<','>Độ mở bàn tay<'], ['>Exploded view<','>Chế độ bung tách<'], ['Open your hand to pull it apart · close it to assemble','Xòe tay để tách bộ phận · nắm tay để lắp lại'],
    ['>Gestures<','>Cử chỉ<'], ['title="Space">🫰 Snap','title="Space">🫰 Tụ hạt'], ['title="F">✊ Form','title="F">✊ Tạo hình'], ['title="O">✋ Release','title="O">✋ Bung tách'], ['title="V / →">✌ Next','title="V / →">✌ Tiếp theo'],
    ['Pull out','Tách ra'], ['Read aloud','Đọc mô tả'], ['Point ☝ at another part · pinch 🤏 to pull it out','Chỉ ☝ vào bộ phận khác · chụm 🤏 để kéo ra'],
    ['>Controls<','>Điều khiển<'], ['<h2>Controls</h2>','<h2>Điều khiển</h2>'], ['<div class="brand-sub">snap · form · explode — with your hand</div>','<div class="brand-sub">chụm tay · tạo hình · bung tách bằng cử chỉ</div>'], ['Snap — summon / dissolve','Tụ hạt / làm tan'], ['Fist (form) / Open hand (release)','Nắm tay (tạo hình) / xòe tay (bung tách)'], ['Next / previous model','Mô hình tiếp theo / trước đó'], ['Exploded view (engines &amp; car)','Bung tách (động cơ và xe)'], ['Rotate the model','Xoay mô hình'], ['Pick a part (or click it) · pull it out','Chọn bộ phận (hoặc nhấn) · kéo ra'], ['Zoom (also','Thu phóng (cũng dùng được'], ['Cut-away slice (move hand / mouse)','Cắt lớp (di chuyển tay / chuột)'], ['Quiz · voice · record video · describe part','Đố vui · giọng nói · quay video · mô tả bộ phận'], ['Auto-rotate · labels · trails','Tự xoay · nhãn · vệt sáng'], ['Camera · demo · this help','Camera · trình diễn · trợ giúp'],
    ['Glowing 3D wonders, the human body (brain, beating heart, breathing lungs, eye, ear, skeleton…), DNA, a cell, engines, vehicles and machines made of up to a quarter-million light particles — controlled by your hand in front of the webcam.','Kỳ quan 3D phát sáng, cơ thể người (não, tim đập, phổi hô hấp, mắt, tai, bộ xương…), ADN, tế bào, động cơ, phương tiện và máy móc được tạo từ hàng trăm nghìn hạt sáng — điều khiển bằng bàn tay trước camera.'],
    ['Snap your fingers to summon the particles.','Chụm/ngắt ngón tay để triệu hồi các hạt sáng.'], ['Make a fist to form a wonder, engine or car.','Nắm tay để lắp thành kỳ quan, động cơ hoặc xe.'], ['Open your hand: wonders morph to the next one — organs, engines and the car explode to show every part inside, named with what it does. Close your hand to put it back together.','Xòe tay: chuyển sang kỳ quan kế tiếp; các cơ quan, động cơ và xe sẽ bung tách để hiển thị từng bộ phận. Nắm tay để lắp chúng lại.'],  ['Twist your hand to turn the model, raise or lower it to tilt; two hands zoom.','Xoay cổ tay để xoay mô hình, nâng/hạ tay để nghiêng; dùng hai tay để thu phóng và xoay kiểu không gian.'], ['Point ☝ at a part to learn what it does, pinch 🤏 to pull it out. Try the 🎓 quiz, 🎤 voice, ✂ cut-away and ⏺ recording.','Chỉ ☝ vào bộ phận để xem thông tin; chụm 🤏 để chọn và kéo bộ phận ra, rồi di chuyển tay để điều khiển vị trí. Thử đố vui 🎓, giọng nói 🎤, cắt lớp ✂ và quay ⏺.'], ['Show <b>✌</b> to jump to the next model.','Giơ <b>✌</b> để chuyển sang mô hình tiếp theo.'], ['Start with camera','Bắt đầu với camera'], ['Continue without camera','Tiếp tục không dùng camera'],
    ['Part details','Chi tiết bộ phận'], ['Close (Esc)','Đóng (Esc)'], ['Quiz: find the part','Đố vui: tìm bộ phận'], ['Stop quiz (Q)','Dừng đố vui (Q)'], ['Pull out','Tách ra'], ['Read aloud','Đọc mô tả'], ['Camera on/off (C)','Bật/tắt camera (C)'], ['Part labels (L)','Nhãn bộ phận (L)'], ['Auto-rotate (R)','Tự xoay (R)'], ['Hand rotation: twist your hand to turn the model (G)','Xoay mô hình bằng cổ tay (G)'], ['Cut-away cross-section (X)','Cắt lớp (X)'], ['Quiz: find the part (Q)','Đố vui: tìm bộ phận (Q)'], ['Voice commands + read aloud (M)','Lệnh giọng nói và đọc mô tả (M)'], ['Record a video (K)','Quay video (K)'], ['Play demo (D)','Chạy trình diễn (D)'], ['Keyboard help (H)','Trợ giúp phím tắt (H)'], ['Hand rotation: twist your hand to turn the model, raise or lower it to tilt (G)','Xoay cổ tay để xoay mô hình; nâng/hạ tay để nghiêng (G)'], ['two hands','hai tay'], ['rotate the model','xoay mô hình'], ['open hand','xòe tay'], ['fist','nắm tay'],
  ];
  for (const [from, to] of pairs) source = source.replaceAll(from, to);
  // Broad fragments are intentionally last so they cannot break longer sentences above.
  for (const [from, to] of [['particles','hạt sáng'],['particle','hạt sáng'],['parts','bộ phận'],['twist hand','xoay cổ tay'],['Point','Chỉ tay'],['drag','kéo bằng chuột'],['two hands','hai tay'],['fist','nắm tay'],['open hand','xòe tay'],['close it','nắm tay'],['part','bộ phận']]) { const escaped = from.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&'); source = source.replace(new RegExp('\\b' + escaped + '\\b', 'g'), to); }
  source = source.replace('point at a part', 'chỉ vào bộ phận').replace('twist = rotate', 'xoay cổ tay = xoay mô hình');
  if (!source.includes('<html lang="vi">') || !source.includes('Độ nhạy cử chỉ')) throw new Error('Vietnamese WonderSnap HTML localization did not apply');
  return source;
}

export function localizeWonderSnapFeatures(source) {
  // Normalize Vietnamese accents and map common Vietnamese voice intents into the existing robust parser.
  source = replaceOnce(source,
    "const words = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\\s+/).filter(Boolean);",
    "const noAccent = (s) => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');\nconst words = (s) => noAccent(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\\s+/).filter(Boolean);\nconst viVoice = (s) => { let t = noAccent(s).toLowerCase(); const rules = [[/\\b(phong to|zoom in|to hon|gan hon)\\b/g,'zoom in'],[/\\b(thu nho|zoom out|nho hon|xa hon)\\b/g,'zoom out'],[/\\b(xoay|xoay mo hinh|quay mo hinh)\\b/g,'rotate'],[/\\b(bung tach|mo ra|tach ra|xem ben trong)\\b/g,'explode'],[/\\b(lap lai|rap lai|khep lai)\\b/g,'assemble'],[/\\b(tiep theo|ke tiep|mau tiep)\\b/g,'next'],[/\\b(quay lai|truoc do|mau truoc)\\b/g,'previous'],[/\\b(trieu hoi|tao hinh hat|bat dau)\\b/g,'summon'],[/\\b(lam tan|bien mat|xoa mo hinh)\\b/g,'dissolve'],[/\\b(cat lop|mat cat)\\b/g,'cut'],[/\\b(ghi hinh|quay video)\\b/g,'record'],[/\\b(dung do vui)\\b/g,'stop quiz'],[/\\b(do vui|kiem tra kien thuc)\\b/g,'quiz'],[/\\b(mo hinh trai tim|trai tim)\\b/g,'heart'],[/\\b(bo nao|nao nguoi)\\b/g,'brain'],[/\\b(phoi)\\b/g,'lungs'],[/\\b(xuong|bo xuong)\\b/g,'skeleton'],[/\\b(thap rua)\\b/g,'turtle'],[/\\b(thap eiffel)\\b/g,'eiffel tower'],[/\\b(nu than tu do)\\b/g,'statue of liberty'],[/\\b(dai kim tu thap|kim tu thap giza)\\b/g,'great pyramid'],[/\\b(dau truong la ma)\\b/g,'colosseum'],[/\\b(thap nghieng pisa)\\b/g,'leaning tower of pisa'],[/\\b(den taj mahal)\\b/g,'taj mahal'],[/\\b(thap big ben)\\b/g,'big ben'],[/\\b(ton tuong chua cuu the|tuong chua cuu the)\\b/g,'christ the redeemer'],[/\\b(nha hat opera sydney)\\b/g,'sydney opera house'],[/\\b(thap burj khalifa)\\b/g,'burj khalifa'],[/\\b(xe the thao|sieu xe)\\b/g,'sports car'],[/\\b(nao nguoi)\\b/g,'human brain'],[/\\b(tim nguoi)\\b/g,'human heart'],[/\\b(mat nguoi)\\b/g,'human eye'],[/\\b(tai nguoi)\\b/g,'human ear'],[/\\b(bo xuong nguoi)\\b/g,'skeleton'],[/\\b(chuoi xoan kep adn|adn)\\b/g,'dna double helix']]; for (const [re, value] of rules) t = t.replace(re, value); return t; };",
    'Vietnamese voice command normalization');
  source = source.replace('const t = ` ${words(text).join(\' \')} `, has = (...ws) => ws.some((w) => t.includes(` ${w} `));', 'const t = ` ${words(viVoice(text)).join(\' \')} `, has = (...ws) => ws.some((w) => t.includes(` ${w} `));');
  source = source.replace("rec.lang = 'en-US';", "rec.lang = 'vi-VN';");
  source = source.replace("u.rate = 1.02; u.pitch = 1.0;", "u.lang = 'vi-VN'; u.rate = 1.02; u.pitch = 1.0;");
  source = source.replace("// Voice control (Web Speech API), spoken part descriptions, session recording (MediaRecorder) and the\n// command parser that turns a sentence into app actions. Kept free of app state so it is easy to test.", "// Điều khiển giọng nói tiếng Việt, đọc mô tả bộ phận, ghi phiên làm việc và phân tích câu lệnh.\n// Bộ phân tích được giữ độc lập để dễ kiểm thử.");
  if (!source.includes("rec.lang = 'vi-VN'") || !source.includes('viVoice(text)')) throw new Error('Vietnamese WonderSnap voice patch did not apply');
  return source;
}
