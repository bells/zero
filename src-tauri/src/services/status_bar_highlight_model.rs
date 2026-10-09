#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HighlightPhase {
    Press,
    Menu,
    Surface(String),
}

#[derive(Debug, Default)]
pub struct HighlightModel {
    pub generation: u64,
    pub active: Option<(String, HighlightPhase)>,
}

impl HighlightModel {
    pub fn begin(&mut self, id: String, phase: HighlightPhase) -> u64 {
        self.generation = self.generation.wrapping_add(1);
        self.active = Some((id, phase));
        self.generation
    }

    pub fn clear(&mut self, generation: u64) {
        if self.generation == generation {
            self.active = None;
        }
    }

    pub fn release_press(&mut self, id: &str) -> bool {
        let accepted =
            matches!(self.active.as_ref(), Some((current, HighlightPhase::Press)) if current == id);
        if matches!(self.active, Some((_, HighlightPhase::Press))) {
            self.active = None;
        }
        accepted
    }

    pub fn retain_visible(&mut self, ids: &[String]) {
        if self
            .active
            .as_ref()
            .is_some_and(|(id, _)| !ids.contains(id))
        {
            self.active = None;
        }
    }

    pub fn cell_range(&self, ids: &[String], primary_id: &str) -> Option<(usize, usize)> {
        let (id, _) = self.active.as_ref()?;
        let index = ids.iter().position(|visible| visible == id)?;
        Some(if id == primary_id {
            (0, ids.len())
        } else {
            (index, 1)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tool_is_local_primary_covers_group_and_reorder_follows_id() {
        let mut state = HighlightModel::default();
        let ids = vec!["a".into(), "b".into(), "zero".into()];
        state.begin("b".into(), HighlightPhase::Press);
        assert_eq!(state.cell_range(&ids, "zero"), Some((1, 1)));
        assert_eq!(
            state.cell_range(&["b".into(), "a".into(), "zero".into()], "zero"),
            Some((0, 1))
        );
        state.begin("zero".into(), HighlightPhase::Menu);
        assert_eq!(state.cell_range(&ids, "zero"), Some((0, 3)));
        assert_eq!(state.cell_range(&["zero".into()], "zero"), Some((0, 1)));
    }

    #[test]
    fn old_menu_close_cannot_clear_new_surface() {
        let mut state = HighlightModel::default();
        let old = state.begin("a".into(), HighlightPhase::Menu);
        let new = state.begin("b".into(), HighlightPhase::Surface("paper".into()));
        state.clear(old);
        assert!(state.active.is_some());
        state.clear(new);
        assert!(state.active.is_none());
    }

    #[test]
    fn hidden_or_removed_target_never_moves_highlight_to_neighbor() {
        let mut state = HighlightModel::default();
        state.begin("a".into(), HighlightPhase::Press);
        state.retain_visible(&["b".into(), "zero".into()]);
        assert!(state.active.is_none());
    }

    #[test]
    fn cancelled_press_does_not_activate_neighbor_and_direct_action_releases_feedback() {
        let mut state = HighlightModel::default();
        state.begin("a".into(), HighlightPhase::Press);
        assert!(!state.release_press("b"));
        assert!(state.active.is_none());
        state.begin("a".into(), HighlightPhase::Press);
        assert!(state.release_press("a"));
        assert!(state.active.is_none());
        let menu = state.begin("a".into(), HighlightPhase::Menu);
        assert!(!state.release_press("a"));
        assert!(state.active.is_some());
        state.clear(menu);
        assert!(state.active.is_none());
    }
}
