using UnityEngine;

/// <summary>
/// 掛在金幣 GameObject 上，Collider2D 需勾選 Is Trigger。
/// 玩家碰到時加分並銷毀自己。
/// </summary>
public class CoinPickup : MonoBehaviour
{
    [SerializeField] private int scoreValue = 1;

    private void OnTriggerEnter2D(Collider2D other)
    {
        if (!other.CompareTag("Player"))
        {
            return;
        }

        if (GameManager.Instance != null)
        {
            GameManager.Instance.AddScore(scoreValue);
        }

        Destroy(gameObject);
    }
}
