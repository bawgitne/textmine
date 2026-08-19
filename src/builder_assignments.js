const BUILDER_ASSIGNMENTS = Object.freeze({
  XinCoDungDi: 'T1',
  XinOngDungDi: 'H1',
  XinTuiDungDi: 'A_HAT_SAC',
  XinNgaDungDi: 'T2'
});

function getBuilderAssignment(username) {
  return BUILDER_ASSIGNMENTS[(username || '').trim()] || null;
}

module.exports = { BUILDER_ASSIGNMENTS, getBuilderAssignment };
