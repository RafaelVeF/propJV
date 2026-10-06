export function switchView(hideView: HTMLElement | null, showView: HTMLElement | null) {
  if (hideView) {
    hideView.classList.remove('active');
    setTimeout(() => {
      hideView.classList.add('hidden');
    }, 300);
  }

  if (showView) {
    setTimeout(() => {
      showView.classList.remove('hidden');
      setTimeout(() => {
        showView.classList.add('active');
      }, 50);
    }, hideView ? 300 : 0);
  }
}
