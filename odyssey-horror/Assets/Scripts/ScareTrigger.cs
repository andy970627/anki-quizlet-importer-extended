using UnityEngine;

/// <summary>
/// 掛在一個有 Collider2D/Collider（勾選 Is Trigger）的空 GameObject 上，
/// 放在走廊轉角、門後這類玩家會突然靠近的地方。
/// 玩家進入範圍時播放一次驚嚇音效，只觸發一次。
/// </summary>
public class ScareTrigger : MonoBehaviour
{
    [SerializeField] private AudioSource scareAudio;
    [SerializeField] private bool triggerOnce = true;

    private bool hasTriggered;

    private void OnTriggerEnter(Collider other)
    {
        if (!other.CompareTag("Player"))
        {
            return;
        }

        if (triggerOnce && hasTriggered)
        {
            return;
        }

        hasTriggered = true;
        scareAudio?.Play();
    }
}
